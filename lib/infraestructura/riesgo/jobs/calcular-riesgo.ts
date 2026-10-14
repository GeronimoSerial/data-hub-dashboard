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
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { SQLiteTable } from 'drizzle-orm/sqlite-core'
import { getDb } from '@/lib/db'
import { conReintentoPorBloqueo } from '@/lib/db/reintento'
import { infraPeriodo, infraRiskFactor, infraRiskRun, infraRiskSnapshot } from '@/lib/db/schema'
import { crearAdapterAislamiento } from '../motor/adaptadores/aislamiento'
import { crearAdapterExposicion } from '../motor/adaptadores/exposicion'
import { crearAdapterRioPrefectura } from '../motor/adaptadores/rio-prefectura'
import { crearAdapterHistorial } from '../motor/adaptadores/historial'
import { crearAdapterLluvia } from '../motor/adaptadores/lluvia'
import { crearAdapterPeligro } from '../motor/adaptadores/peligro'
import { crearAdapterSusceptibilidad } from '../motor/adaptadores/susceptibilidad'
import { crearAdapterTerritorio } from '../motor/adaptadores/territorio'
import { calcularRiesgoEscuela } from '../motor/calculo'
import { MOTOR_VERSION } from '../motor/config'
import type {
  HorizontePeligro,
  IndicadoresSusceptibilidad,
  LluviaObservadaCelda,
  IndiceAislamiento,
  NivelCaudalPunto,
  NivelPeligroCelda,
  PerfilTerritorio,
  PuertosMotor,
  EvidenciaRioPrefectura,
  ResumenExposicion,
  ResumenHistorial,
} from '../motor/puertos'
import { adquirirLease, inicioDeBloqueUtc, publicarResultado, renovarLease } from '../job-run'

const TIPO_JOB = 'calcular-riesgo-v0'
const VERSION_JOB = 'v1'

// 15 minutos: el job recorre ~2005 escuelas x 3 horizontes y persiste en
// lotes; más generoso que el lease de sync-pronostico-caudal.ts, que consulta
// mucho menos volumen.
const DURACION_LEASE_MS = 15 * 60 * 1000

// Escuelas por lote de inserción bulk.
const TAMANO_LOTE = 200

// SQLite limita la cantidad de variables ("binds") por sentencia
// (SQLITE_MAX_VARIABLE_NUMBER; 32766 en builds recientes, 999 en viejos). Un
// único INSERT de un lote completo (TAMANO_LOTE=200 escuelas x 3 horizontes x
// hasta ~8 factores/snapshot con más fuentes reales conectadas) puede superarlo
// y reventar el job. Por eso cada lote se sub-trocea en INSERTs más chicos:
// infraRiskFactor tiene 11 columnas, así que 500 filas = 5500 binds, holgado.
const TAMANO_CHUNK_INSERCION = 500

type DbMotor = ReturnType<typeof getDb>

// Inserta `filas` en `tabla` partiéndolas en chunks de a lo sumo
// `tamanoChunk`, para no exceder el límite de binds de SQLite.
async function insertarEnChunks<TSchema extends SQLiteTable>(
  db: DbMotor,
  tabla: TSchema,
  filas: TSchema['$inferInsert'][],
  tamanoChunk: number,
): Promise<void> {
  for (let inicio = 0; inicio < filas.length; inicio += tamanoChunk) {
    const chunk = filas.slice(inicio, inicio + tamanoChunk)
    // Cada chunk es un INSERT único de filas con ids ya generados (nunca se
    // regeneran entre intentos): si SQLITE_BUSY interrumpe el statement no
    // queda nada escrito, así que reintentar el mismo INSERT es seguro. El
    // run sigue 'preparando' durante todo este loop, invisible para
    // lectores, así que un reintento acá no afecta la publicación atómica.
    if (chunk.length > 0) await conReintentoPorBloqueo(() => db.insert(tabla).values(chunk))
  }
}

const HORIZONTES: readonly HorizontePeligro[] = [24, 72, 240] as const

export type ResultadoJobCalcularRiesgo =
  | { ejecutado: true; runId: string; escuelasProcesadas: number; conEvidencia: number; sinEvidencia: number }
  | { ejecutado: false; motivo: 'en_progreso_vigente' | 'ya_completado' | 'cobertura_insuficiente' }

function construirPuertosReales(): PuertosMotor {
  return {
    peligro: crearAdapterPeligro(),
    lluviaObservada: crearAdapterLluvia(),
    territorio: crearAdapterTerritorio(),
    aislamiento: crearAdapterAislamiento(),
    susceptibilidad: crearAdapterSusceptibilidad(),
    historial: crearAdapterHistorial(),
    exposicion: crearAdapterExposicion(),
    rioPrefectura: crearAdapterRioPrefectura(),
  }
}

// Cacheo por corrida de las consultas que NO dependen del horizonte. El núcleo
// calcularRiesgoEscuela se invoca una vez por (escuela, horizonte) y, para cada
// horizonte, vuelve a pedir exactamente los mismos datos: el perfil territorial
// (dato estático por escuela), el peligro de celda, el caudal del punto, la
// lluvia observada, el historial, el aislamiento, la susceptibilidad y la
// exposición. Ninguno de esos puertos recibe el horizonte como parámetro y
// `asOf` es constante en toda la corrida, así que memoizar por su clave natural
// (cueAnexo / geometryRef / puntoId) no cambia el resultado observable, sólo
// evita repetir la misma consulta 3 veces (una por horizonte) y una vez por
// cada escuela que comparte celda.
//
// obtenerNivelesCelda se trata aparte: el núcleo pide un horizonte por vez
// (`horizontes: [h]`). Acá se pide la lista completa de horizontes UNA vez por
// geometryRef y se filtra en memoria el horizonte solicitado, en vez de golpear
// el puerto por cada horizonte y por cada escuela que comparte la misma celda.
function crearPuertosConCache(puertos: PuertosMotor): PuertosMotor {
  const perfiles = new Map<string, Promise<PerfilTerritorio | null>>()
  const nivelesCelda = new Map<string, Promise<NivelPeligroCelda[]>>()
  const nivelesCaudal = new Map<string, Promise<NivelCaudalPunto | null>>()
  const lluvia = new Map<string, Promise<LluviaObservadaCelda>>()
  const historiales = new Map<string, Promise<ResumenHistorial>>()
  const aislamientos = new Map<string, Promise<IndiceAislamiento | null>>()
  const susceptibilidades = new Map<string, Promise<IndicadoresSusceptibilidad | null>>()
  const exposiciones = new Map<string, Promise<ResumenExposicion | null>>()
  const evidenciasRio = new Map<string, Promise<EvidenciaRioPrefectura | null>>()

  function memoizar<K, V>(
    cache: Map<K, Promise<V>>,
    clave: K,
    producir: () => Promise<V>,
  ): Promise<V> {
    const cacheado = cache.get(clave)
    if (cacheado !== undefined) return cacheado
    const promesa = producir()
    cache.set(clave, promesa)
    return promesa
  }

  return {
    peligro: {
      obtenerNivelesCelda(params) {
        const promesa = memoizar(nivelesCelda, params.geometryRef, () =>
          puertos.peligro.obtenerNivelesCelda({
            geometryRef: params.geometryRef,
            horizontes: HORIZONTES,
            asOf: params.asOf,
          }),
        )
        // El array cacheado es el conjunto completo de horizontes; cada
        // llamador recibe una vista filtrada a los horizontes que pidió, igual
        // que devolvería el puerto subyacente.
        return promesa.then((todos) =>
          todos.filter((nivel) => params.horizontes.includes(nivel.horizonteHoras)),
        )
      },
      obtenerNivelCaudal(params) {
        return memoizar(nivelesCaudal, params.puntoId, () =>
          puertos.peligro.obtenerNivelCaudal(params),
        )
      },
    },
    lluviaObservada: {
      obtenerAcumulado(params) {
        return memoizar(lluvia, params.geometryRef, () =>
          puertos.lluviaObservada.obtenerAcumulado(params),
        )
      },
    },
    territorio: {
      obtenerPerfil(cueAnexo) {
        return memoizar(perfiles, cueAnexo, () => puertos.territorio.obtenerPerfil(cueAnexo))
      },
      listarCuesConPerfil() {
        return puertos.territorio.listarCuesConPerfil()
      },
    },
    aislamiento: {
      obtenerIndice(cueAnexo) {
        return memoizar(aislamientos, cueAnexo, () => puertos.aislamiento.obtenerIndice(cueAnexo))
      },
    },
    susceptibilidad: {
      obtenerIndicadores(cueAnexo) {
        return memoizar(susceptibilidades, cueAnexo, () =>
          puertos.susceptibilidad.obtenerIndicadores(cueAnexo),
        )
      },
    },
    historial: {
      obtenerResumen(params) {
        return memoizar(historiales, params.cueAnexo, () =>
          puertos.historial.obtenerResumen(params),
        )
      },
    },
    exposicion: {
      obtenerResumen(params) {
        return memoizar(exposiciones, params.cueAnexo, () =>
          puertos.exposicion.obtenerResumen(params),
        )
      },
    },
    ...(puertos.rioPrefectura
      ? {
          rioPrefectura: {
            obtenerEvidencia(params: { cueAnexo: string; asOf: string }) {
              const puerto = puertos.rioPrefectura!
              return memoizar(evidenciasRio, params.cueAnexo, () => puerto.obtenerEvidencia(params))
            },
          },
        }
      : {}),
  }
}

export async function calcularYPublicarRiesgo(params?: {
  ahora?: Date
  puertos?: PuertosMotor
}): Promise<ResultadoJobCalcularRiesgo> {
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
  // reiniciarse por lote.
  const puertos = crearPuertosConCache(params?.puertos ?? construirPuertosReales())
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
        modeloVersion: MOTOR_VERSION,
        iniciadoEn: asOf,
        publicadoEn: null,
        estado: 'preparando',
        cobertura: null,
        creadaEn: asOf,
      }),
    )

    const cueAnexos = await puertos.territorio.listarCuesConPerfil()

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
          const resultado = await calcularRiesgoEscuela({ cueAnexo, horizonte, asOf, puertos })
          const snapshotId = randomUUID()

          filasSnapshot.push({
            id: snapshotId,
            runId: idRun,
            cueAnexo,
            horizonteHoras: horizonte,
            evidenciaValida: resultado.evidenciaValida,
            scoreRiesgo: resultado.scoreRiesgo,
            nivelRiesgo: resultado.nivelRiesgo,
            scoreAmenaza: resultado.scoreAmenaza,
            nivelAmenaza: resultado.nivelAmenaza,
            scoreVulnerabilidad: resultado.scoreVulnerabilidad,
            confianza: resultado.confianza,
            scoreRiesgoAcceso: resultado.riesgoAcceso.score,
            nivelRiesgoAcceso: resultado.riesgoAcceso.nivel,
            confianzaAcceso: resultado.riesgoAcceso.confianza,
            exposicionMatricula: resultado.exposicion.matricula,
            exposicionSecciones: resultado.exposicion.secciones,
            calculadoEn: resultado.calculadoEn,
            validoHasta: resultado.validoHasta,
          })

          for (const factor of resultado.factores) {
            filasFactor.push({
              id: randomUUID(),
              snapshotId,
              tipo: factor.tipo,
              fuente: factor.fuente,
              variable: factor.variable,
              valor: factor.valor,
              unidad: factor.unidad,
              contribucion: factor.contribucion,
              peso: factor.peso,
              explicacion: factor.explicacion,
              observadoEn: factor.observadoEn,
            })
          }

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
    // invisible para cualquier lector que filtre por vigente. Esta transacción
    // corta es la ÚNICA que cambia qué run es el vigente, y el índice único
    // parcial infra_risk_run_vigente_unico (ver schema.ts) impone a nivel DB
    // que nunca haya dos vigentes a la vez. Sólo estas 2 actualizaciones: los
    // inserts masivos ya se hicieron fuera de la transacción. Reintento
    // seguro ante SQLITE_BUSY: la transacción se revierte entera si falla a
    // mitad de camino, y repetir las mismas 2 actualizaciones desde cero
    // produce el mismo estado final (vencer el vigente anterior + publicar
    // este run), sin duplicar ni saltear ninguna.
    await conReintentoPorBloqueo(() =>
      db.transaction(async (tx) => {
        await tx
          .update(infraRiskRun)
          .set({ estado: 'vencido' })
          .where(eq(infraRiskRun.estado, 'vigente'))
        await tx
          .update(infraRiskRun)
          .set({
            estado: 'vigente',
            publicadoEn: new Date().toISOString(),
            cobertura: { procesadas, conEvidencia, sinEvidencia },
          })
          .where(eq(infraRiskRun.id, idRun))
      }),
    )

    await publicarResultado({
      jobRunId,
      leaseOwner,
      estado: 'completado',
      contadores: { procesadas, conEvidencia, sinEvidencia },
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
