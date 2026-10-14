// Wrappers de lease sobre la generación y el cierre de veredictos diarios.
// El lease en infra_job_run evita corridas superpuestas y da idempotencia,
// igual que briefing-ia/job.ts. El gating por AI_VEREDICTO_ENABLED vive en
// scripts/jobs.mjs, no acá.
import { getDb } from '@/lib/db'
import { adquirirLease, publicarResultado } from '@/lib/infraestructura/riesgo/job-run'
import { fechaArt, sumarDias } from './dia'
import { cerrarDiaAnterior, generarVeredictos, type ResultadoGenerar } from './generar'

const TIPO_JOB_DIARIO = 'veredicto-diario-v0'
const TIPO_JOB_CIERRE = 'veredicto-cierre-v0'
const VERSION_JOB = 'v1'
const DURACION_LEASE_MS = 10 * 60 * 1000
const SLOT_MS = 6 * 60 * 60 * 1000

export type ResultadoJobVeredicto =
  | { ejecutado: true; resultado: ResultadoGenerar }
  | { ejecutado: false; motivo: string }

export type ResultadoJobCierreVeredicto =
  | { ejecutado: true; fecha: string }
  | { ejecutado: false; motivo: string }

// Slot de 6h en UTC: todas las corridas dentro del mismo slot comparten clave.
function slotUtc(ahora: Date): string {
  return new Date(Math.floor(ahora.getTime() / SLOT_MS) * SLOT_MS).toISOString()
}

export async function correrJobVeredicto(params?: {
  ahora?: Date
  generar?: typeof generarVeredictos
}): Promise<ResultadoJobVeredicto> {
  const ahora = params?.ahora
  const generar = params?.generar ?? generarVeredictos

  const lease = await adquirirLease({
    tipo: TIPO_JOB_DIARIO,
    claveIdempotente: slotUtc(ahora ?? new Date()),
    version: VERSION_JOB,
    duracionLeaseMs: DURACION_LEASE_MS,
    ahora,
  })
  if (!lease.adquirido) return { ejecutado: false, motivo: lease.motivo }

  try {
    const resultado = await generar(getDb(), { ahora, jobRunId: lease.jobRunId })

    await publicarResultado({
      jobRunId: lease.jobRunId,
      leaseOwner: lease.leaseOwner,
      estado: 'completado',
      contadores: {
        evaluados: resultado.evaluados,
        insertados: resultado.insertados,
        fuenteIa: resultado.fuenteIa,
        fuentePlantilla: resultado.fuentePlantilla,
      },
      ahora,
    })

    return { ejecutado: true, resultado }
  } catch (error) {
    await publicarResultado({
      jobRunId: lease.jobRunId,
      leaseOwner: lease.leaseOwner,
      estado: 'fallido',
      // Nunca se persiste el mensaje crudo del error para no filtrar detalles.
      errorSaneado: 'fallo al generar los veredictos',
      ahora,
    })
    throw error
  }
}

export async function correrJobCierreVeredicto(params?: {
  ahora?: Date
}): Promise<ResultadoJobCierreVeredicto> {
  const ahora = params?.ahora ?? new Date()
  const fecha = sumarDias(fechaArt(ahora), -1)

  const lease = await adquirirLease({
    tipo: TIPO_JOB_CIERRE,
    claveIdempotente: fecha,
    version: VERSION_JOB,
    duracionLeaseMs: DURACION_LEASE_MS,
    ahora: params?.ahora,
  })
  if (!lease.adquirido) return { ejecutado: false, motivo: lease.motivo }

  try {
    await cerrarDiaAnterior(getDb(), ahora)

    await publicarResultado({
      jobRunId: lease.jobRunId,
      leaseOwner: lease.leaseOwner,
      estado: 'completado',
      ahora: params?.ahora,
    })

    return { ejecutado: true, fecha }
  } catch (error) {
    await publicarResultado({
      jobRunId: lease.jobRunId,
      leaseOwner: lease.leaseOwner,
      estado: 'fallido',
      errorSaneado: 'fallo al cerrar el día de veredictos',
      ahora: params?.ahora,
    })
    throw error
  }
}
