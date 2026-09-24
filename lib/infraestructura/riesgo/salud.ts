// Estado operativo mínimo para el panel interno de E0: flags de feature y
// último run conocido por tipo de job. Sólo lectura — nunca dispara jobs.
import { getDb } from '@/lib/db'
import { infraJobRun } from '@/lib/db/schema'
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
}

export type EstadoOperativo = {
  flags: {
    riskEngineEnabled: boolean
    riskRadarEnabled: boolean
    aiBriefingEnabled: boolean
    riskMode: 'shadow' | 'advisory'
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
    })
  }

  return {
    flags: {
      riskEngineEnabled: riskEngineEnabled(),
      riskRadarEnabled: riskRadarEnabled(),
      aiBriefingEnabled: aiBriefingEnabled(),
      riskMode: riskMode(),
    },
    jobs,
    generadoEn: ahora.toISOString(),
  }
}
