// Wrapper de lease sobre la generación del briefing narrativo asistido por IA
// (E8). El lease en infra_job_run evita corridas superpuestas y da idempotencia,
// igual que en el resto de los jobs del repo.
import { adquirirLease, publicarResultado } from '@/lib/infraestructura/riesgo/job-run'
import { generarBriefingAsistido } from './generar-briefing-asistido'
import { crearPuertoCorteSituacionReal } from './puertos'

const TIPO_JOB = 'briefing-ia-v0'
const VERSION_JOB = 'v1'
const DURACION_LEASE_MS = 10 * 60 * 1000

export type ResultadoJobBriefingIA =
  | { ejecutado: true; corteId: string; fuente: 'ia' | 'plantilla'; motivoFallback: string | null }
  | {
      ejecutado: false
      motivo: 'sin_corte_disponible' | 'en_progreso_vigente' | 'ya_completado'
    }

export async function correrJobBriefingIA(params?: {
  ahora?: Date
}): Promise<ResultadoJobBriefingIA> {
  const puerto = crearPuertoCorteSituacionReal()

  // A diferencia de otros jobs del repo (p. ej. episodios derivados, que usan
  // el día UTC como clave conocida de antemano), acá la clave idempotente es
  // el id del corte y no se conoce hasta leer el último corte persistido. Por
  // eso el corte se resuelve ANTES de pedir el lease; si no hay corte no hay
  // nada que briefar y no tiene sentido tocar infra_job_run.
  const corte = await puerto.obtenerUltimoCorte()
  if (corte === null) {
    return { ejecutado: false, motivo: 'sin_corte_disponible' }
  }

  const lease = await adquirirLease({
    tipo: TIPO_JOB,
    claveIdempotente: corte.id,
    version: VERSION_JOB,
    duracionLeaseMs: DURACION_LEASE_MS,
    ahora: params?.ahora,
  })
  if (!lease.adquirido) return { ejecutado: false, motivo: lease.motivo }

  try {
    const resultado = await generarBriefingAsistido({ puerto, ahora: params?.ahora })

    if (!resultado.ejecutado) {
      // Carrera posible: el corte desapareció entre la lectura de arriba y la
      // ejecución del pipeline. No debería pasar, pero se publica el job como
      // fallido para no dejar el lease como exitoso sin briefing.
      await publicarResultado({
        jobRunId: lease.jobRunId,
        leaseOwner: lease.leaseOwner,
        estado: 'fallido',
        errorSaneado: 'corte ya no disponible al ejecutar',
        ahora: params?.ahora,
      })
      return { ejecutado: false, motivo: 'sin_corte_disponible' }
    }

    await publicarResultado({
      jobRunId: lease.jobRunId,
      leaseOwner: lease.leaseOwner,
      estado: 'completado',
      contadores: { esFuenteIa: resultado.briefing.fuente === 'ia' ? 1 : 0 },
      ahora: params?.ahora,
    })

    return {
      ejecutado: true,
      corteId: corte.id,
      fuente: resultado.briefing.fuente,
      motivoFallback: resultado.briefing.motivoFallback,
    }
  } catch (error) {
    await publicarResultado({
      jobRunId: lease.jobRunId,
      leaseOwner: lease.leaseOwner,
      estado: 'fallido',
      // Nunca se persiste el mensaje crudo del error para no filtrar detalles.
      errorSaneado: 'fallo al generar el briefing asistido',
      ahora: params?.ahora,
    })
    throw error
  }
}
