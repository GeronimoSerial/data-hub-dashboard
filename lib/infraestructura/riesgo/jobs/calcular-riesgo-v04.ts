// Job candidato de Motor v0.4 (U1 de "Motor v0.4/PLAN_IMPLEMENTACION.md").
// Desde la promoción (T11) el operativo calcular-riesgo corre v0.4: este job
// ya no se programa ni se espera en salud; queda sólo para corridas manuales
// de evaluación con el padrón completo (scripts/jobs.mjs). Aislado del
// operativo (jobs/calcular-riesgo.ts):
// - lease propio en infra_job_run (TIPO_JOB distinto, misma clave de bloque de
//   6 h): repetir dentro del bloque devuelve 'ya_completado' y no duplica;
// - el run nace 'preparando' con `modo = 'candidato'` y termina 'completado',
//   NUNCA 'vigente': no llama al publicador (publicar-run.ts) y la restricción
//   infra_risk_run_candidato_no_vigente (migración 0024) lo impide en DB;
// - los lectores operativos filtran `estado = 'vigente'`, así que el candidato
//   no aparece en ninguna consulta pública.
// Universo: padrón completo (motor-v04/padron.ts), una fila por CUE/anexo ×
// 24/72/240 h. Desde T6 la superación del terreno se modela por transferencia
// por km de río donde es estimable (motor-v04/superacion-terreno.ts); el resto
// de los eventos sigue `no_estimable` con motivo.
// Motor único (T8): cada escuela con coordenadas corre el MISMO cálculo v0.3
// (calcularRiesgoEscuela, todos sus puertos) y, donde la superación es
// `modelada`, el factor río probabilístico reemplaza al de v0.3. Las columnas
// heredadas (nivel/score/factores) quedan como las escribiría v0.3 con ese
// reemplazo; `resultado_v04` guarda el detalle. Las escuelas sin coordenadas
// no tienen fila en v0.3: acá conservan la fila de T1 con nivel null y motivo.
import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { conReintentoPorBloqueo } from '@/lib/db/reintento'
import { infraPeriodo, infraRiskFactor, infraRiskRun, infraRiskSnapshot } from '@/lib/db/schema'
import type { PuertosMotor } from '../motor/puertos'
import { calcularFilasEscuela, construirPuertoRioRegion, construirPuertosReales, crearPuertosConCache, insertarEnChunks } from './compartido-riesgo'
import { adquirirLease, inicioDeBloqueUtc, publicarResultado, renovarLease } from '../job-run'
import { CONFIG_V04, HORIZONTES_V04, MOTOR_V04_VERSION, hashCanonico } from '../motor-v04/config'
import { esquemaMetadatosRunV04, type ResultadoEscuelaV04 } from '../motor-v04/contratos'
import { crearAdapterAltimetriaV04, type PuertoAltimetriaV04 } from '../motor-v04/altimetria-adaptador'
import { crearAdapterPadronV04, type PuertoPadronV04 } from '../motor-v04/padron'
import { construirResultadoPendienteV04, resumirCoberturaV04 } from '../motor-v04/resultado'
import { crearAdapterTerrenoV04, type PuertoTerrenoV04 } from '../motor-v04/terreno-adaptador'
import { prepararRioV04 } from '../motor-v04/preparacion-rio-v04'
import { rioProbabilisticoDe } from './insumos-operativo-v04'

const TIPO_JOB = 'calcular-riesgo-v04-candidato'
const VERSION_JOB = 'v1'
const DURACION_LEASE_MS = 15 * 60 * 1000

// Filas por INSERT: infra_risk_snapshot tiene ~21 columnas, 500 filas quedan
// muy por debajo del límite de parámetros por sentencia de Postgres (65.535).
const TAMANO_CHUNK_INSERCION = 500

export type ResultadoJobCandidatoV04 =
  | { ejecutado: true; runId: string; resultadosEmitidos: number }
  | { ejecutado: false; motivo: 'en_progreso_vigente' | 'ya_completado' | 'padron_no_disponible' }

export async function calcularRiesgoCandidatoV04(params?: {
  ahora?: Date
  padron?: PuertoPadronV04
  altimetria?: PuertoAltimetriaV04
  terreno?: PuertoTerrenoV04
  puertos?: PuertosMotor
}): Promise<ResultadoJobCandidatoV04> {
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
  if (!lease.adquirido) return { ejecutado: false, motivo: lease.motivo }

  const { jobRunId, leaseOwner } = lease
  const db = getDb()
  let runId: string | undefined

  try {
    // Un padrón vacío o ilegible no produce un candidato "completado" con
    // cobertura cero: se registra la falla y no se crea corrida.
    const padron = await (params?.padron ?? crearAdapterPadronV04()).listarPadron()
    if (padron === null || padron.length === 0) {
      await publicarResultado({ jobRunId, leaseOwner, estado: 'fallido', errorSaneado: 'padron no disponible', ahora })
      return { ejecutado: false, motivo: 'padron_no_disponible' }
    }

    // Altimetría (T2) disponible como insumo para tareas posteriores: todavía
    // no se calcula ninguna probabilidad. null = sin versión importada.
    const altimetria = await (params?.altimetria ?? crearAdapterAltimetriaV04()).obtener(padron.map((e) => e.cueAnexo))
    const conAltimetria = altimetria
      ? [...altimetria.porCue.values()].filter((r) => r?.estado === 'candidata').length
      : 0

    // Insumos de superación del terreno (T6): null = no pudieron cargarse.
    const terrenoCrudo = await (params?.terreno ?? crearAdapterTerrenoV04()).cargar(padron.map((e) => e.cueAnexo), asOf)
    // Reglas v0.4: series depuradas (T10d), escenarios de subida (F3),
    // referencia estable (T10c), máximos de análogos por escala y zona
    // modelada con altura crítica (T10d).
    const { terreno, escenarios, referencias, maximosEscala, superacion, tendencias, alcancesMargen, descartadasPorEstacion } =
      prepararRioV04({ padron, terreno: terrenoCrudo, altimetria, asOf })

    const [periodo] = await db.select().from(infraPeriodo).where(eq(infraPeriodo.estado, 'vigente')).limit(1)
    if (!periodo) {
      await publicarResultado({ jobRunId, leaseOwner, estado: 'fallido', errorSaneado: 'sin periodo vigente', ahora })
      throw new Error('calcular-riesgo-v04: no hay periodo vigente')
    }

    const resultados: ResultadoEscuelaV04[] = []
    for (const escuela of padron) {
      for (const horizonteHoras of HORIZONTES_V04) {
        const superacionTerreno = superacion.get(escuela.cueAnexo)?.[horizonteHoras]
        resultados.push(construirResultadoPendienteV04({ escuela, horizonteHoras, asOf, modo: 'candidato', superacionTerreno }))
      }
    }
    const cobertura = resumirCoberturaV04({ padron, resultados })
    const metadatos = esquemaMetadatosRunV04.parse({
      modeloVersion: MOTOR_V04_VERSION,
      modo: 'candidato',
      asOf,
      creadaEn: new Date().toISOString(),
      publicadaEn: null,
      padronVersion: `padron-${hashCanonico(padron.map((e) => e.cueAnexo).sort())}`,
      configHash: hashCanonico(CONFIG_V04),
      insumosHash: hashCanonico({
        padron,
        altimetriaVersion: altimetria?.version ?? null,
        catalogoA5Version: terreno?.catalogoVersion ?? null,
        tramosVersion: terreno?.tramosVersion ?? null,
        escenariosSubida: Object.fromEntries([...escenarios].map(([id, e]) => [id, e.porHorizonte])),
        referenciasNivel: Object.fromEntries(referencias),
        descartadasDepuracion: Object.fromEntries(descartadasPorEstacion),
        ultimaFechaSerie: terreno ? Object.fromEntries([...terreno.series].map(([id, f]) => [id, f.at(-1)?.fecha ?? null])) : null,
      }),
      estadoCalibracionEscolar: 'pendiente',
      cobertura,
    })

    runId = randomUUID()
    const idRun = runId
    await conReintentoPorBloqueo(() =>
      db.insert(infraRiskRun).values({
        id: idRun,
        periodoId: periodo.id,
        modeloVersion: MOTOR_V04_VERSION,
        iniciadoEn: asOf,
        publicadoEn: null,
        estado: 'preparando',
        modo: 'candidato',
        cobertura: {
          procesadas: resultados.length,
          totalPadron: cobertura.totalPadron,
          sinUbicacionUtilizable: cobertura.sinUbicacionUtilizable,
        },
        metadatos,
        creadaEn: asOf,
      }),
    )

    // Reglas v0.4 (T10): el candidato corrige los defectos auditados de v0.3.
    const puertos = crearPuertosConCache(params?.puertos ?? {
      ...construirPuertosReales({ reglas: 'v0.4', escenariosSubida: escenarios }),
      rioPrefectura: construirPuertoRioRegion({ reglas: 'v0.4', escenarios, referencias, maximosEscala }),
    })
    const sinUbicacion = new Set(padron.filter((e) => e.motivoUbicacion !== null).map((e) => e.cueAnexo))
    for (let inicio = 0; inicio < resultados.length; inicio += TAMANO_CHUNK_INSERCION) {
      const filasSnapshot: (typeof infraRiskSnapshot.$inferInsert)[] = []
      const filasFactor: (typeof infraRiskFactor.$inferInsert)[] = []
      for (const r of resultados.slice(inicio, inicio + TAMANO_CHUNK_INSERCION)) {
        if (sinUbicacion.has(r.cueAnexo)) {
          filasSnapshot.push(filaSnapshotSinUbicacion(idRun, r))
          continue
        }
        const { snapshot, factores } = await calcularFilasEscuela({
          runId: idRun,
          cueAnexo: r.cueAnexo,
          horizonte: r.horizonteHoras,
          asOf,
          puertos,
          rioProbabilistico: rioProbabilisticoDe(r, tendencias.get(r.cueAnexo)?.[r.horizonteHoras] ?? null, alcancesMargen.get(r.cueAnexo)?.[r.horizonteHoras] ?? null),
          reglas: 'v0.4',
          extraSnapshot: { resultadoV04: r as unknown as Record<string, unknown> },
        })
        filasSnapshot.push(snapshot)
        filasFactor.push(...factores)
      }
      // Ids fijados antes del intento: reintentar el mismo INSERT es seguro.
      await conReintentoPorBloqueo(() => db.insert(infraRiskSnapshot).values(filasSnapshot))
      await insertarEnChunks(db, infraRiskFactor, filasFactor, TAMANO_CHUNK_INSERCION)
      await renovarLease({ jobRunId, leaseOwner, duracionLeaseMs: DURACION_LEASE_MS, ahora: new Date() })
    }

    // Cierre del candidato: 'completado', nunca 'vigente'. Condicionado a que
    // siga 'preparando' y sea candidato, para no pisar otro estado.
    const [cerrado] = await conReintentoPorBloqueo(() =>
      db
        .update(infraRiskRun)
        .set({ estado: 'completado' })
        .where(and(eq(infraRiskRun.id, idRun), eq(infraRiskRun.estado, 'preparando'), eq(infraRiskRun.modo, 'candidato')))
        .returning({ id: infraRiskRun.id }),
    )
    if (!cerrado) throw new Error('calcular-riesgo-v04: el run candidato cambió de estado antes de cerrarse')

    await publicarResultado({
      jobRunId,
      leaseOwner,
      estado: 'completado',
      contadores: {
        procesadas: resultados.length,
        totalPadron: cobertura.totalPadron,
        conAltimetria,
        estacionesConEscenario: escenarios.size,
        estacionesConTendencia: [...escenarios.values()].filter((e) => e.tasaMediaM !== null).length,
        conSuperacionTerreno: new Set(resultados.filter((r) => r.superacionTerreno.conservador.estado === 'modelada').map((r) => r.cueAnexo)).size,
      },
      ahora,
    })
    return { ejecutado: true, runId: idRun, resultadosEmitidos: resultados.length }
  } catch (error) {
    // Igual que el job operativo (H5): no dejar el run colgado en
    // 'preparando'; sus filas parciales quedan atadas a un run 'fallido',
    // invisible para todo lector.
    if (runId !== undefined) {
      const idFallido = runId
      try {
        await conReintentoPorBloqueo(() =>
          db.update(infraRiskRun).set({ estado: 'fallido' }).where(eq(infraRiskRun.id, idFallido)),
        )
      } catch {
        // Limpieza best-effort: se prioriza propagar el error original.
      }
    }
    await publicarResultado({
      jobRunId,
      leaseOwner,
      estado: 'fallido',
      errorSaneado: 'fallo al ejecutar calcular-riesgo-v04-candidato',
      ahora,
    })
    throw error
  }
}

// Columnas heredadas para una escuela SIN ubicación utilizable (v0.3 no tiene
// fila para ella): todos los scores y niveles van en null (nivel desconocido,
// no 'bajo'). Las columnas NOT NULL se llenan con el
// mismo criterio que motor/calculo.ts usa para una escuela sin evidencia:
// `evidenciaValida = false`, `confianza = 'baja'` y `validoHasta = asOf` (no
// se declara validez futura). El resultado real vive en `resultado_v04`.
function filaSnapshotSinUbicacion(runId: string, r: ResultadoEscuelaV04): typeof infraRiskSnapshot.$inferInsert {
  return {
    id: randomUUID(),
    runId,
    cueAnexo: r.cueAnexo,
    horizonteHoras: r.horizonteHoras,
    evidenciaValida: false,
    scoreRiesgo: null,
    nivelRiesgo: null,
    scoreAmenaza: null,
    nivelAmenaza: null,
    scoreVulnerabilidad: null,
    confianza: 'baja',
    scoreRiesgoAcceso: null,
    nivelRiesgoAcceso: null,
    confianzaAcceso: null,
    exposicionMatricula: null,
    exposicionSecciones: null,
    calculadoEn: r.asOf,
    validoHasta: r.asOf,
    resultadoV04: r as unknown as Record<string, unknown>,
  }
}
