// Wrapper de lease sobre el recomputo de episodios derivados. Mismo espíritu
// que lib/infraestructura/riesgo/jobs/calcular-riesgo.ts pero más simple: acá
// no hace falta un run-pointer "vigente/vencido" porque recompute.ts ya
// reemplaza de forma atómica todo el resultado de la versión de regla vigente.
// El lease en infra_job_run sólo evita corridas superpuestas y da idempotencia.
import { adquirirLease, publicarResultado } from '@/lib/infraestructura/riesgo/job-run'
import { recomputarEpisodiosDerivados } from './recompute'

const TIPO_JOB = 'episodios-derivados-v0'
const VERSION_JOB = 'v1'
const DURACION_LEASE_MS = 10 * 60 * 1000

export type ResultadoJobEpisodiosDerivados =
  | {
      ejecutado: true
      episodiosCreados: number
      escuelasExcluidas: number
      departamentosProcesados: number
    }
  | { ejecutado: false; motivo: 'en_progreso_vigente' | 'ya_completado' }

// Clave idempotente: día UTC (YYYY-MM-DD). Dos invocaciones del mismo día
// comparten el job run; no hay noción de "bloque de 6h" acá porque cada
// corrida recalcula todo desde cero de forma determinista.
export async function correrJobEpisodiosDerivados(params?: {
  ahora?: Date
}): Promise<ResultadoJobEpisodiosDerivados> {
  const ahora = params?.ahora ?? new Date()
  const clave = ahora.toISOString().slice(0, 10)

  const lease = await adquirirLease({
    tipo: TIPO_JOB,
    claveIdempotente: clave,
    version: VERSION_JOB,
    duracionLeaseMs: DURACION_LEASE_MS,
    ahora,
  })
  if (!lease.adquirido) return { ejecutado: false, motivo: lease.motivo }

  try {
    const resultado = await recomputarEpisodiosDerivados({ asOf: ahora })
    await publicarResultado({
      jobRunId: lease.jobRunId,
      leaseOwner: lease.leaseOwner,
      estado: 'completado',
      contadores: {
        episodiosCreados: resultado.episodiosCreados,
        escuelasExcluidas: resultado.escuelasExcluidas,
      },
      ahora,
    })
    return {
      ejecutado: true,
      episodiosCreados: resultado.episodiosCreados,
      escuelasExcluidas: resultado.escuelasExcluidas,
      departamentosProcesados: resultado.departamentosProcesados,
    }
  } catch (error) {
    await publicarResultado({
      jobRunId: lease.jobRunId,
      leaseOwner: lease.leaseOwner,
      estado: 'fallido',
      errorSaneado: 'fallo al recomputar episodios derivados',
      ahora,
    })
    throw error
  }
}
