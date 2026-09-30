// Estado operativo mínimo para el panel interno de E0: flags de feature y
// último run conocido por tipo de job. Sólo lectura — nunca dispara jobs.
import { getDb } from '@/lib/db'
import { infraJobRun } from '@/lib/db/schema'
import { enosJobsEnabled } from '@/lib/infraestructura/jobs/flags'
import { aiBriefingEnabled, riskEngineEnabled, riskMode, riskRadarEnabled } from './flags'

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
  generadoEn: string
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
    generadoEn: ahora.toISOString(),
  }
}
