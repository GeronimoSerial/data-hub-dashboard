// Historial de corridas de los últimos 72 h por item del panel "Estado de los
// datos" (sólo los jobs escriben infra_job_run; el resto de las fuentes no
// tiene historial). Sólo lectura y acotado: filtra por tipo (prefijo del
// índice único tipo+clave) y por la ventana de 72 h.
import { and, gte, inArray } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { infraJobRun } from '@/lib/db/schema'
import { JOBS_ESPERADOS } from '../jobs-esperados'
import { VENTANA_LATIDO_HORAS, type CorridaLatido } from '@/components/infraestructura/estado-datos/latido'

export type CorridasPorItem = Record<string, CorridaLatido[]>

export async function obtenerCorridasPorItem(ahora: Date = new Date()): Promise<CorridasPorItem> {
  const jobs = JOBS_ESPERADOS.filter((j): j is typeof j & { tipo: string } => j.tipo !== null)
  if (jobs.length === 0) return {}
  const desde = new Date(ahora.getTime() - VENTANA_LATIDO_HORAS * 3_600_000).toISOString()
  const filas = await getDb()
    .select({
      tipo: infraJobRun.tipo,
      estado: infraJobRun.estado,
      iniciadoEn: infraJobRun.iniciadoEn,
      finalizadoEn: infraJobRun.finalizadoEn,
      actualizadaEn: infraJobRun.actualizadaEn,
    })
    .from(infraJobRun)
    .where(and(inArray(infraJobRun.tipo, [...new Set(jobs.map((j) => j.tipo))]), gte(infraJobRun.iniciadoEn, desde)))

  const porTipo = new Map<string, CorridaLatido[]>()
  for (const fila of filas) {
    // Una corrida en curso todavía no es ni latido ni falla.
    if (fila.estado !== 'completado' && fila.estado !== 'fallido') continue
    const lista = porTipo.get(fila.tipo) ?? []
    lista.push({ en: fila.finalizadoEn ?? fila.actualizadaEn, ok: fila.estado === 'completado' })
    porTipo.set(fila.tipo, lista)
  }
  const resultado: CorridasPorItem = {}
  for (const job of jobs) resultado[`job:${job.nombre}`] = porTipo.get(job.tipo) ?? []
  return resultado
}

// Falla segura: sin historial el panel sigue mostrando el último éxito.
export async function obtenerCorridasPorItemSeguro(): Promise<CorridasPorItem> {
  try {
    return await obtenerCorridasPorItem()
  } catch {
    return {}
  }
}
