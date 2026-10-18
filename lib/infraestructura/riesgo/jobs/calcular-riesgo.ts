// Job de cálculo y publicación atómica del motor de riesgo v0 (E3b). Integra
// piezas ya existentes: el núcleo puro (motor/calculo.ts), los adapters reales
// (territorio/historial/exposición/aislamiento/susceptibilidad) y los stubs
// explícitos de "no disponible" (peligro/lluvia), y persiste
// snapshots/factores en las tablas de dominio infra_risk_*.
//
// Idempotencia y atomicidad:
// 1. `infra_job_run` (job-run.ts): la claveIdempotente es el bloque de 6h UTC,
//    así dos invocaciones dentro de la misma ventana compiten por el MISMO job
//    run y sólo una calcula. Repetir devuelve 'ya_completado'.
// 2. Publicación atómica por run: los snapshots/factores se escriben desde el
//    principio pero ETIQUETADOS a un run en estado 'preparando', invisible para
//    cualquier lector que filtre por 'vigente'. Una transacción corta final es
//    la ÚNICA que decide qué run es el vigente.
// Una escuela/horizonte que falla no debería tumbar el job; el manejo de
// errores global re-publica el infra_job_run como 'fallido' antes de re-lanzar.
//
// Motor v0.4 promovido (T11, docs/motor-v0.4/promocion.md): por defecto el run
// es `motor-v0.4` con reglas v0.4, río probabilístico donde la superación del
// terreno es `modelada` (insumos-operativo-v04.ts) y `resultado_v04` por fila.
// El universo NO cambia: sólo escuelas con perfil (listarCuesConPerfil), igual
// que motor-v0.3. RIESGO_REGLAS_MOTOR=v0.3 (flags.ts) es el rollback de un
// ciclo: run `motor-v0.3` idéntico byte a byte al previo a la promoción.
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { conReintentoPorBloqueo } from '@/lib/db/reintento'
import { infraPeriodo, infraRiskFactor, infraRiskRun, infraRiskSnapshot } from '@/lib/db/schema'
import { MOTOR_VERSION, MOTOR_VERSION_V03, REGLAS_V04_VERSION, type ReglasMotor } from '../motor/config'
import { crearAdapterRioPrefectura } from '../motor/adaptadores/rio-prefectura'
import { riesgoReglasMotor } from '../flags'
import { crearAdapterAltimetriaV04, type PuertoAltimetriaV04 } from '../motor-v04/altimetria-adaptador'
import { CONFIG_V04, hashCanonico, type HorizonteV04 } from '../motor-v04/config'
import { crearAdapterPadronV04, type PuertoPadronV04 } from '../motor-v04/padron'
import { construirResultadoPendienteV04 } from '../motor-v04/resultado'
import { crearAdapterTerrenoV04, type PuertoTerrenoV04 } from '../motor-v04/terreno-adaptador'
import { prepararInsumosOperativoV04, rioProbabilisticoDe, type InsumosOperativoV04 } from './insumos-operativo-v04'
import type { PuertosMotor } from '../motor/puertos'
import { adquirirLease, inicioDeBloqueUtc, publicarResultado, renovarLease } from '../job-run'
import { publicarRunOperativo } from '../publicar-run'
import {
  HORIZONTES,
  TAMANO_CHUNK_INSERCION,
  calcularFilasEscuela,
  construirPuertosReales,
  crearPuertosConCache,
  insertarEnChunks,
} from './compartido-riesgo'

const TIPO_JOB = 'calcular-riesgo-v0'
const VERSION_JOB = 'v1'

// 15 minutos: el job recorre ~2005 escuelas x 3 horizontes y persiste en
// lotes; más generoso que el lease de sync-pronostico-caudal.ts, que consulta
// mucho menos volumen.
const DURACION_LEASE_MS = 15 * 60 * 1000

// Escuelas por lote de inserción bulk.
const TAMANO_LOTE = 200

export type ResultadoJobCalcularRiesgo =
  | { ejecutado: true; runId: string; escuelasProcesadas: number; conEvidencia: number; sinEvidencia: number }
  | { ejecutado: false; motivo: 'en_progreso_vigente' | 'ya_completado' | 'cobertura_insuficiente' }

export async function calcularYPublicarRiesgo(params?: {
  ahora?: Date
  puertos?: PuertosMotor
  // Insumos v0.4 inyectables (tests); por defecto, los adapters reales.
  padron?: PuertoPadronV04
  altimetria?: PuertoAltimetriaV04
  terreno?: PuertoTerrenoV04
}): Promise<ResultadoJobCalcularRiesgo> {
  const reglas: ReglasMotor = riesgoReglasMotor()
  const modeloVersion = reglas === 'v0.4' ? MOTOR_VERSION : MOTOR_VERSION_V03
  const ahora = params?.ahora ?? new Date()
  const asOf = ahora.toISOString()
  const claveIdempotente = inicioDeBloqueUtc(ahora).toISOString()

  const lease = await adquirirLease({
    tipo: TIPO_JOB,
    claveIdempotente,
    version: VERSION_JOB,
    duracionLeaseMs: DURACION_LEASE_MS,
    ahora,
  })
  // No adquirir el lease no es un fallo de esta invocación: otra ya lo tiene o
  // ya terminó. No se publica nada (mismo patrón que sync-pronostico-caudal.ts).
  if (!lease.adquirido) {
    return { ejecutado: false, motivo: lease.motivo }
  }

  const { jobRunId, leaseOwner } = lease
  // Los puertos se envuelven una única vez por corrida: el cacheo debe vivir
  // todo el bucle (escuelas x horizontes) para eliminar las repeticiones, no
  // reiniciarse por lote. Con reglas v0.4 los puertos reales necesitan los
  // escenarios del río, así que se arman después de preparar sus insumos;
  // el territorio (lista de CUEs) es el mismo en ambos casos.
  const puertosBase = params?.puertos ?? construirPuertosReales({ reglas })
  const observadoPeligro: ObservacionPeligro240 = { respaldo: false, sinDato: false }
  let puertos = observarPeligro240(crearPuertosConCache(puertosBase), observadoPeligro)
  const db = getDb()

  // `runId` se asigna recién después de insertar la fila 'preparando'. Se
  // declara fuera del try para que el catch pueda marcarla 'fallido' si el
  // proceso se interrumpe a mitad de camino (H5); si la excepción ocurre antes
  // del insert (p. ej. buscando el período vigente) queda `undefined` y el
  // catch simplemente no toca la tabla.
  let runId: string | undefined

  try {
    // Un período vigente siempre existe en una instalación sembrada; su
    // ausencia es un error de datos, no una salida silenciosa.
    const [periodo] = await db
      .select()
      .from(infraPeriodo)
      .where(eq(infraPeriodo.estado, 'vigente'))
      .limit(1)
    if (!periodo) {
      await publicarResultado({
        jobRunId,
        leaseOwner,
        estado: 'fallido',
        errorSaneado: 'sin periodo vigente',
        ahora,
      })
      throw new Error('calcular-riesgo: no hay periodo vigente')
    }

    // El run nace en 'preparando': sus snapshots/factores existen pero no son
    // visibles como vigentes hasta la transacción de publicación del final.
    // Este insert es INDEPENDIENTE del de snapshots/factores.
    runId = randomUUID()
    const idRun = runId
    // Insert único con id ya fijado: seguro de reintentar ante SQLITE_BUSY,
    // nada queda escrito si el statement no llegó a correr.
    await conReintentoPorBloqueo(() =>
      db.insert(infraRiskRun).values({
        id: idRun,
        periodoId: periodo.id,
        modeloVersion,
        iniciadoEn: asOf,
        publicadoEn: null,
        estado: 'preparando',
        modo: 'operativo',
        cobertura: null,
        creadaEn: asOf,
      }),
    )

    const cueAnexos = await puertos.territorio.listarCuesConPerfil()

    let v04: InsumosOperativoV04 | null = null
    if (reglas === 'v0.4') {
      v04 = await prepararInsumosOperativoV04({
        cueAnexos,
        asOf,
        padron: params?.padron ?? crearAdapterPadronV04(),
        altimetria: params?.altimetria ?? crearAdapterAltimetriaV04(),
        terreno: params?.terreno ?? crearAdapterTerrenoV04(),
      })
      if (!params?.puertos) {
        const { escenarios, referencias, maximosEscala } = v04.rio
        puertos = observarPeligro240(
          crearPuertosConCache({
            ...construirPuertosReales({ reglas: 'v0.4', escenariosSubida: escenarios }),
            rioPrefectura: crearAdapterRioPrefectura({ reglas: 'v0.4', escenarios, referencias, maximosEscala }),
          }),
          observadoPeligro,
        )
      }
    }
    let conRioProbabilistico = 0

    const filasSnapshot: (typeof infraRiskSnapshot.$inferInsert)[] = []
    const filasFactor: (typeof infraRiskFactor.$inferInsert)[] = []
    let procesadas = 0
    let conEvidencia = 0
    let sinEvidencia = 0

    for (let inicio = 0; inicio < cueAnexos.length; inicio += TAMANO_LOTE) {
      const lote = cueAnexos.slice(inicio, inicio + TAMANO_LOTE)
      filasSnapshot.length = 0
      filasFactor.length = 0

      for (const cueAnexo of lote) {
        for (const horizonte of HORIZONTES) {
          const detalle = v04 ? detalleV04(v04, cueAnexo, horizonte as HorizonteV04, asOf) : null
          if (detalle?.rioProbabilistico) conRioProbabilistico += 1
          const { resultado, snapshot, factores } = await calcularFilasEscuela({
            runId: idRun,
            cueAnexo,
            horizonte,
            asOf,
            puertos,
            ...(detalle && {
              reglas: 'v0.4' as const,
              rioProbabilistico: detalle.rioProbabilistico,
              extraSnapshot: { resultadoV04: detalle.resultado as unknown as Record<string, unknown> },
            }),
          })
          filasSnapshot.push(snapshot)
          filasFactor.push(...factores)

          // Contadores por snapshot (una escuela cuenta una vez por horizonte),
          // no por escuela.
          procesadas += 1
          if (resultado.evidenciaValida) conEvidencia += 1
          else sinEvidencia += 1
        }
      }

      // Inserts normales fuera de transacción: el run sigue 'preparando', así
      // que un lote lento no bloquea a ningún lector. Se trocea para no
      // exceder SQLITE_MAX_VARIABLE_NUMBER (ver TAMANO_CHUNK_INSERCION).
      await insertarEnChunks(db, infraRiskSnapshot, filasSnapshot, TAMANO_CHUNK_INSERCION)
      await insertarEnChunks(db, infraRiskFactor, filasFactor, TAMANO_CHUNK_INSERCION)

      // Renovar el lease tras cada lote para no repetir el bug de E2 (H2: un
      // lease que nunca se renueva y expira en volúmenes reales).
      await renovarLease({
        jobRunId,
        leaseOwner,
        duracionLeaseMs: DURACION_LEASE_MS,
        ahora: new Date(),
      })
    }

    // Guard explícito de completitud. En JS síncrono una excepción ya habría
    // cortado antes de llegar acá; se deja igual para no publicar un run
    // parcial si en el futuro el procesamiento se vuelve concurrente.
    if (procesadas !== cueAnexos.length * HORIZONTES.length) {
      await conReintentoPorBloqueo(() =>
        db.update(infraRiskRun).set({ estado: 'fallido' }).where(eq(infraRiskRun.id, idRun)),
      )
      await publicarResultado({
        jobRunId,
        leaseOwner,
        estado: 'fallido',
        errorSaneado: 'cobertura insuficiente',
        ahora,
      })
      return { ejecutado: false, motivo: 'cobertura_insuficiente' }
    }

    // PUBLICACIÓN ATÓMICA POR RUN: los datos (snapshots/factores) ya estaban
    // escritos desde el bucle pero ETIQUETADOS a un run en 'preparando',
    // invisible para cualquier lector que filtre por vigente. El publicador
    // explícito (publicar-run.ts) es el ÚNICO que cambia qué run es el
    // vigente: valida modo y versión en servidor y corre la transacción corta
    // (vencer el vigente anterior + publicar este run). El índice único
    // parcial infra_risk_run_vigente_unico (ver schema.ts) impone a nivel DB
    // que nunca haya dos vigentes a la vez.
    // Degradación de peligro a 240 h, observada al consultar cada celda. Se
    // suma a `degradacion` antes de escribir metadatos y de contar insumos.
    if (v04) {
      if (observadoPeligro.respaldo) v04.degradacion.push('peligro_240h_respaldo')
      if (observadoPeligro.sinDato) v04.degradacion.push('peligro_240h_sin_dato')
    }
    // Metadatos v0.4: insumos y degradación de la corrida (la cobertura
    // conserva las 3 claves que lee el frontend). El rollback v0.3 no escribe
    // metadatos, igual que motor-v0.3.
    if (v04) {
      const metadatos = metadatosOperativoV04(v04, { modeloVersion, asOf, conRioProbabilistico })
      await conReintentoPorBloqueo(() => db.update(infraRiskRun).set({ metadatos }).where(eq(infraRiskRun.id, idRun)))
    }

    const publicacion = await publicarRunOperativo({
      runId: idRun,
      cobertura: { procesadas, conEvidencia, sinEvidencia },
    })
    // Este job siempre crea runs operativos de una versión operativa; un rechazo es un
    // error de programación y se trata como falla (el catch marca 'fallido').
    if (!publicacion.publicado) {
      throw new Error(`calcular-riesgo: publicación rechazada (${publicacion.motivo})`)
    }

    await publicarResultado({
      jobRunId,
      leaseOwner,
      estado: 'completado',
      contadores: v04
        ? { procesadas, conEvidencia, sinEvidencia, conRioProbabilistico, insumosDegradados: v04.degradacion.length }
        : { procesadas, conEvidencia, sinEvidencia },
      ahora,
    })

    return { ejecutado: true, runId: idRun, escuelasProcesadas: procesadas, conEvidencia, sinEvidencia }
  } catch (error) {
    // H5: si el run llegó a crearse, no dejarlo colgado en 'preparando' para
    // siempre. Sólo se toca la tabla si `runId` ya fue asignado (una excepción
    // anterior al insert, p. ej. sin período vigente, no tiene fila que marcar)
    // y el update va en su propio try para que un fallo de esta limpieza no
    // reemplace ni oculte el error original.
    if (runId !== undefined) {
      try {
        await conReintentoPorBloqueo(() =>
          db.update(infraRiskRun).set({ estado: 'fallido' }).where(eq(infraRiskRun.id, runId as string)),
        )
      } catch {
        // Limpieza best-effort: se prioriza propagar el error original.
      }
    }
    // No dejar el infra_job_run colgado 'en_progreso', pero tampoco tragarse
    // la excepción. Mensaje corto y sin datos nominales.
    await publicarResultado({
      jobRunId,
      leaseOwner,
      estado: 'fallido',
      errorSaneado: 'fallo al ejecutar calcular-riesgo-v0',
      ahora,
    })
    throw error
  }
}

type ObservacionPeligro240 = { respaldo: boolean; sinDato: boolean }

// Envuelve el puerto de peligro para registrar, sin cambiar lo que devuelve, si
// alguna consulta a 240 h usó la ingesta de respaldo o terminó en sin_dato.
function observarPeligro240(puertos: PuertosMotor, observado: ObservacionPeligro240): PuertosMotor {
  return {
    ...puertos,
    peligro: {
      ...puertos.peligro,
      async obtenerNivelesCelda(params) {
        const niveles = await puertos.peligro.obtenerNivelesCelda(params)
        for (const nivel of niveles) {
          if (nivel.horizonteHoras !== 240) continue
          if (nivel.respaldoIngestaPrevia) observado.respaldo = true
          if (nivel.nivel === 'sin_dato') observado.sinDato = true
        }
        return niveles
      },
    },
  }
}

// Resultado v0.4 de una escuela del universo operativo y su evidencia
// probabilística (null ⇒ el cálculo usa el río de v0.3).
function detalleV04(v04: InsumosOperativoV04, cueAnexo: string, horizonte: HorizonteV04, asOf: string) {
  const escuela = v04.escuelas.get(cueAnexo) ?? { cueAnexo, motivoUbicacion: null }
  const resultado = construirResultadoPendienteV04({
    escuela,
    horizonteHoras: horizonte,
    asOf,
    modo: 'operativo',
    superacionTerreno: v04.rio.superacion.get(cueAnexo)?.[horizonte],
  })
  const rioProbabilistico = rioProbabilisticoDe(
    resultado,
    v04.rio.tendencias.get(cueAnexo)?.[horizonte] ?? null,
    v04.rio.alcancesMargen.get(cueAnexo)?.[horizonte] ?? null,
  )
  return { resultado, rioProbabilistico }
}

function metadatosOperativoV04(
  v04: InsumosOperativoV04,
  ctx: { modeloVersion: string; asOf: string; conRioProbabilistico: number },
): Record<string, unknown> {
  const { terreno, escenarios, referencias, descartadasPorEstacion } = v04.rio
  return {
    modeloVersion: ctx.modeloVersion,
    modo: 'operativo',
    reglas: 'v0.4',
    reglasVersion: REGLAS_V04_VERSION,
    asOf: ctx.asOf,
    configHash: hashCanonico(CONFIG_V04),
    insumosHash: hashCanonico({
      altimetriaVersion: v04.altimetria?.version ?? null,
      catalogoA5Version: terreno?.catalogoVersion ?? null,
      tramosVersion: terreno?.tramosVersion ?? null,
      escenariosSubida: Object.fromEntries([...escenarios].map(([id, e]) => [id, e.porHorizonte])),
      referenciasNivel: Object.fromEntries(referencias),
      descartadasDepuracion: Object.fromEntries(descartadasPorEstacion),
    }),
    degradacion: v04.degradacion,
    insumos: {
      altimetriaVersion: v04.altimetria?.version ?? null,
      catalogoA5Version: terreno?.catalogoVersion ?? null,
      estacionesConSerie: terreno?.series.size ?? 0,
      estacionesDesactualizadas: v04.estacionesDesactualizadas,
      ultimaFechaSerie: terreno ? Object.fromEntries([...terreno.series].map(([id, f]) => [id, f.at(-1)?.fecha ?? null])) : null,
      estacionesConEscenario: escenarios.size,
      conRioProbabilistico: ctx.conRioProbabilistico,
    },
  }
}
