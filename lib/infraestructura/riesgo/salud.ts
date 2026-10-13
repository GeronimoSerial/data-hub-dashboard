// Estado operativo mínimo para el panel interno de E0: flags de feature y
// último run conocido por tipo de job. Sólo lectura — nunca dispara jobs.
import { isNotNull, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { hazardPrecipitacionSerie, infraGeoProfile, infraJobRun } from '@/lib/db/schema'
import { enosJobsEnabled } from '@/lib/infraestructura/jobs/flags'
import { ANIOS_MINIMOS_CLIMATOLOGIA } from './climatologia/umbrales'
import { aiBriefingEnabled, riskEngineEnabled, riskMode, riskRadarEnabled } from './flags'
import { JOBS_ESPERADOS, TOLERANCIA_ATRASO_JOB, type JobEsperado } from './jobs-esperados'
import { agruparPuntosPorEra5, type PuntoClimatologia } from './providers/climatologia'

const ANIOS_OBJETIVO_CLIMATOLOGIA = 30

// Cobertura de la climatología de precipitación por celda ERA5: años completos
// (>= 95 % de días con dato) por celda. Ver calcularUmbralesAcumulados.
export type CoberturaClimatologia = {
  celdasTotal: number
  celdasUsables: number
  aniosMin: number
  aniosMediana: number
  aniosMax: number
  aniosObjetivo: typeof ANIOS_OBJETIVO_CLIMATOLOGIA
  minimoUsable: number
}

export type EstadoJobRun = {
  tipo: string
  estado: string
  intento: number
  iniciadoEn: string
  finalizadoEn: string | null
  actualizadaEn: string
  errorSaneado: string | null
  leaseVencido: boolean
  ultimaCompletadaEn: string | null
}

export type EstadoOperativo = {
  flags: {
    // Flags de UI (ocultan/muestran pantallas), no de ejecución de jobs.
    riskEngineEnabled: boolean
    riskRadarEnabled: boolean
    aiBriefingEnabled: boolean
    riskMode: 'shadow' | 'advisory'
    // Flag maestro de ejecución de los jobs batch OPS1 (ver
    // lib/infraestructura/jobs/flags.ts). Encendido por defecto: en false
    // significa que los 8 jobs están en pausa operativa deliberada, no que
    // estén "atrasados".
    enosJobsEnabled: boolean
  }
  jobs: EstadoJobRun[]
  jobsEsperados: JobEsperadoEvaluado[]
  climatologiaPrecipitacion: CoberturaClimatologia
  generadoEn: string
}

/**
 * Resume los años completos por celda ERA5. Las celdas de `celdasTotal` que no
 * están en el mapa cuentan como 0 años. Función pura.
 */
export function resumirCoberturaClimatologia(
  aniosPorCelda: Map<string, number>,
  celdasTotal: number,
): CoberturaClimatologia {
  const ceros = Math.max(0, celdasTotal - aniosPorCelda.size)
  const anios = [...aniosPorCelda.values(), ...Array<number>(ceros).fill(0)].sort((a, b) => a - b)
  const n = anios.length
  const mitad = Math.floor(n / 2)
  const mediana = n === 0 ? 0 : n % 2 === 1 ? anios[mitad] : (anios[mitad - 1] + anios[mitad]) / 2
  return {
    celdasTotal,
    celdasUsables: anios.filter((a) => a >= ANIOS_MINIMOS_CLIMATOLOGIA).length,
    aniosMin: anios[0] ?? 0,
    aniosMediana: mediana,
    aniosMax: anios[n - 1] ?? 0,
    aniosObjetivo: ANIOS_OBJETIVO_CLIMATOLOGIA,
    minimoUsable: ANIOS_MINIMOS_CLIMATOLOGIA,
  }
}

/** Cobertura real desde la base: una consulta agrupada por celda ERA5. */
async function obtenerCoberturaClimatologia(): Promise<CoberturaClimatologia> {
  const db = getDb()
  const filasAnios = await db
    .select({
      celdaEra5: hazardPrecipitacionSerie.celdaEra5,
      anios: sql<number>`count(*) filter (where ${hazardPrecipitacionSerie.diasConDato} >= 0.95 * (case when (${hazardPrecipitacionSerie.anio} % 4 = 0 and (${hazardPrecipitacionSerie.anio} % 100 <> 0 or ${hazardPrecipitacionSerie.anio} % 400 = 0)) then 366 else 365 end))`.mapWith(Number),
    })
    .from(hazardPrecipitacionSerie)
    .groupBy(hazardPrecipitacionSerie.celdaEra5)

  // Mismo universo de celdas que el job: un perfil por geometryRef con lat/lon.
  const filasGeo = await db
    .select({ geometryRef: infraGeoProfile.geometryRef, lat: infraGeoProfile.lat, lon: infraGeoProfile.lon })
    .from(infraGeoProfile)
    .where(isNotNull(infraGeoProfile.geometryRef))
  const primeraPorRef = new Map<string, { lat: number | null; lon: number | null }>()
  for (const fila of filasGeo) {
    if (fila.geometryRef === null || primeraPorRef.has(fila.geometryRef)) continue
    primeraPorRef.set(fila.geometryRef, { lat: fila.lat, lon: fila.lon })
  }
  const puntos: PuntoClimatologia[] = []
  for (const [geometryRef, perfil] of primeraPorRef) {
    if (perfil.lat === null || perfil.lon === null) continue
    puntos.push({ geometryRef, lat: perfil.lat, lon: perfil.lon })
  }
  const celdasTotal = agruparPuntosPorEra5(puntos).length

  const aniosPorCelda = new Map(filasAnios.map((fila) => [fila.celdaEra5, fila.anios]))
  return resumirCoberturaClimatologia(aniosPorCelda, celdasTotal)
}

// `ok`: corrida dentro de la tolerancia. `sin_corridas`: esperado y nunca corrió.
// `atrasado`: la última corrida (de cualquier estado) es más vieja que
// intervalo × TOLERANCIA_ATRASO_JOB. `fallando`: la última corrida está `fallido`
// y no es atrasada. `no_programado`: declarado pero deshabilitado (pendiente P-5),
// no es alarma. `sin_trazabilidad`: el job no escribe infra_job_run.
export type EstadoJobEsperado =
  | 'ok'
  | 'sin_corridas'
  | 'atrasado'
  | 'fallando'
  | 'no_programado'
  | 'sin_trazabilidad'

export type JobEsperadoEvaluado = {
  nombre: string
  tipo: string | null
  habilitado: boolean
  intervaloMinutos: number
  estado: EstadoJobEsperado
  ultimaCorridaEn: string | null
  // Sólo en `fallando`: error saneado de la última corrida, si lo tiene.
  errorSaneado: string | null
  // Última corrida `completado` del tipo, para ver cuánto hace que no anda.
  ultimaCompletadaEn: string | null
}

export type FilaEvaluable = {
  tipo: string
  actualizadaEn: string
  estado?: string
  errorSaneado?: string | null
}

// Evalúa cada job declarado contra la fila más reciente de su `tipo` (cualquier
// estado para `atrasado`; si esa fila es `fallido` pasa a `fallando`).
export function evaluarJobsEsperados(params: {
  filas: ReadonlyArray<FilaEvaluable>
  ahora: Date
  esperados?: readonly JobEsperado[]
}): JobEsperadoEvaluado[] {
  const { filas, ahora, esperados = JOBS_ESPERADOS } = params

  const ultimaPorTipo = new Map<string, { ms: number; fila: FilaEvaluable }>()
  const ultimaCompletadaPorTipo = new Map<string, string>()
  for (const fila of filas) {
    const ms = Date.parse(fila.actualizadaEn)
    const previa = ultimaPorTipo.get(fila.tipo)
    if (previa === undefined || ms > previa.ms) {
      ultimaPorTipo.set(fila.tipo, { ms, fila })
    }
    if (fila.estado === 'completado') {
      const previaCompletada = ultimaCompletadaPorTipo.get(fila.tipo)
      if (previaCompletada === undefined || ms > Date.parse(previaCompletada)) {
        ultimaCompletadaPorTipo.set(fila.tipo, fila.actualizadaEn)
      }
    }
  }

  return esperados.map((job) => {
    const ultima = job.tipo === null ? undefined : ultimaPorTipo.get(job.tipo)
    const base = {
      nombre: job.nombre,
      tipo: job.tipo,
      habilitado: job.habilitado,
      intervaloMinutos: job.intervaloMinutos,
      ultimaCorridaEn: ultima?.fila.actualizadaEn ?? null,
      errorSaneado: null,
      ultimaCompletadaEn: job.tipo === null ? null : (ultimaCompletadaPorTipo.get(job.tipo) ?? null),
    }
    if (!job.habilitado) return { ...base, estado: 'no_programado' }
    if (job.tipo === null) return { ...base, estado: 'sin_trazabilidad' }
    if (ultima === undefined) return { ...base, estado: 'sin_corridas' }
    const limiteMs = job.intervaloMinutos * 60_000 * TOLERANCIA_ATRASO_JOB
    if (ahora.getTime() - ultima.ms > limiteMs) return { ...base, estado: 'atrasado' }
    if (ultima.fila.estado === 'fallido') {
      return { ...base, estado: 'fallando', errorSaneado: ultima.fila.errorSaneado ?? null }
    }
    return { ...base, estado: 'ok' }
  })
}

export async function obtenerEstadoOperativo(): Promise<EstadoOperativo> {
  const db = getDb()
  const filas = await db.select().from(infraJobRun)
  const ahora = new Date()

  // Última fila conocida por tipo (puede haber varias por tipo, una por
  // claveIdempotente distinta): ordenar por actualizadaEn desc y quedarse con
  // la primera vista de cada tipo.
  const ordenadas = [...filas].sort((a, b) => b.actualizadaEn.localeCompare(a.actualizadaEn))

  // Última fila COMPLETADA por tipo: `ordenadas` ya está desc por actualizadaEn,
  // así que la primera fila completada que se ve por tipo es la más reciente. No
  // reusa `vistos` (ese cubre la última fila cualquiera sea su estado).
  const completadasPorTipo = new Map<string, string>()
  for (const fila of ordenadas) {
    if (fila.estado !== 'completado') continue
    if (completadasPorTipo.has(fila.tipo)) continue
    completadasPorTipo.set(fila.tipo, fila.actualizadaEn)
  }

  const vistos = new Set<string>()
  const jobs: EstadoJobRun[] = []
  for (const fila of ordenadas) {
    if (vistos.has(fila.tipo)) continue
    vistos.add(fila.tipo)
    const leaseVencido =
      fila.estado === 'en_progreso' &&
      fila.leaseExpiraEn !== null &&
      new Date(fila.leaseExpiraEn).getTime() < ahora.getTime()
    jobs.push({
      tipo: fila.tipo,
      estado: fila.estado,
      intento: fila.intento,
      iniciadoEn: fila.iniciadoEn,
      finalizadoEn: fila.finalizadoEn,
      actualizadaEn: fila.actualizadaEn,
      errorSaneado: fila.errorSaneado,
      leaseVencido,
      ultimaCompletadaEn: completadasPorTipo.get(fila.tipo) ?? null,
    })
  }

  return {
    flags: {
      riskEngineEnabled: riskEngineEnabled(),
      riskRadarEnabled: riskRadarEnabled(),
      aiBriefingEnabled: aiBriefingEnabled(),
      riskMode: riskMode(),
      enosJobsEnabled: enosJobsEnabled(),
    },
    jobs,
    jobsEsperados: evaluarJobsEsperados({
      filas: filas.map((fila) => ({
        tipo: fila.tipo,
        actualizadaEn: fila.actualizadaEn,
        estado: fila.estado,
        errorSaneado: fila.errorSaneado,
      })),
      ahora,
    }),
    climatologiaPrecipitacion: await obtenerCoberturaClimatologia(),
    generadoEn: ahora.toISOString(),
  }
}
