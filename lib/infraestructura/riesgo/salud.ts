// Estado operativo mínimo para el panel interno de E0: flags de feature y
// último run conocido por tipo de job. Sólo lectura — nunca dispara jobs.
import { getDb } from '@/lib/db'
import { infraJobRun } from '@/lib/db/schema'
import { enosJobsEnabled } from '@/lib/infraestructura/jobs/flags'
import { aiBriefingEnabled, riskEngineEnabled, riskMode, riskRadarEnabled } from './flags'
import { JOBS_ESPERADOS, TOLERANCIA_ATRASO_JOB, type JobEsperado } from './jobs-esperados'

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
  generadoEn: string
}

// `ok`: corrida dentro de la tolerancia. `sin_corridas`: esperado y nunca corrió.
// `atrasado`: la última corrida es más vieja que intervalo × TOLERANCIA_ATRASO_JOB.
// `no_programado`: declarado pero deshabilitado (pendiente P-5), no es alarma.
// `sin_trazabilidad`: el job no escribe infra_job_run, no se puede verificar.
export type EstadoJobEsperado = 'ok' | 'sin_corridas' | 'atrasado' | 'no_programado' | 'sin_trazabilidad'

export type JobEsperadoEvaluado = {
  nombre: string
  tipo: string | null
  habilitado: boolean
  intervaloMinutos: number
  estado: EstadoJobEsperado
  ultimaCorridaEn: string | null
}

// Evalúa cada job declarado contra la fila más reciente de su `tipo` (cualquier
// estado: una corrida fallida igual muestra que el job corrió).
export function evaluarJobsEsperados(params: {
  filas: ReadonlyArray<{ tipo: string; actualizadaEn: string }>
  ahora: Date
  esperados?: readonly JobEsperado[]
}): JobEsperadoEvaluado[] {
  const { filas, ahora, esperados = JOBS_ESPERADOS } = params

  const ultimaPorTipo = new Map<string, { ms: number; actualizadaEn: string }>()
  for (const fila of filas) {
    const ms = Date.parse(fila.actualizadaEn)
    const previa = ultimaPorTipo.get(fila.tipo)
    if (previa === undefined || ms > previa.ms) {
      ultimaPorTipo.set(fila.tipo, { ms, actualizadaEn: fila.actualizadaEn })
    }
  }

  return esperados.map((job) => {
    const ultima = job.tipo === null ? undefined : ultimaPorTipo.get(job.tipo)
    const base = {
      nombre: job.nombre,
      tipo: job.tipo,
      habilitado: job.habilitado,
      intervaloMinutos: job.intervaloMinutos,
      ultimaCorridaEn: ultima?.actualizadaEn ?? null,
    }
    if (!job.habilitado) return { ...base, estado: 'no_programado' }
    if (job.tipo === null) return { ...base, estado: 'sin_trazabilidad' }
    if (ultima === undefined) return { ...base, estado: 'sin_corridas' }
    const limiteMs = job.intervaloMinutos * 60_000 * TOLERANCIA_ATRASO_JOB
    const atrasado = ahora.getTime() - ultima.ms > limiteMs
    return { ...base, estado: atrasado ? 'atrasado' : 'ok' }
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
      filas: filas.map((fila) => ({ tipo: fila.tipo, actualizadaEn: fila.actualizadaEn })),
      ahora,
    }),
    generadoEn: ahora.toISOString(),
  }
}
