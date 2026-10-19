import { and, desc, eq, gte, lt, or } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/lib/db'
import { auditoriaEvento } from '@/lib/db/schema'

const filtro = z.string().trim().min(1).max(128).optional()
const fecha = z.iso.datetime({ offset: true }).optional()
export const consultaAuditoriaSchema = z.object({
  actorId: filtro, accion: filtro, cueAnexo: z.string().regex(/^\d{7}-\d{2}$/).optional(),
  objetoId: filtro,
  resultado: z.enum(['pendiente', 'exito', 'rechazado', 'invalido', 'conflicto', 'repetido', 'sin_cambio', 'error']).optional(),
  desde: fecha, hasta: fecha,
  cursor: z.string().max(256).optional(),
  limite: z.coerce.number().int().min(1).max(100).default(50),
})
export type FiltrosAuditoria = z.infer<typeof consultaAuditoriaSchema>
export type EventoAuditoria = typeof auditoriaEvento.$inferSelect

export function decodificarCursor(valor: string) {
  try {
    const data = JSON.parse(Buffer.from(valor, 'base64url').toString('utf8'))
    const parsed = z.object({ fecha: z.iso.datetime(), id: z.uuid() }).safeParse(data)
    return parsed.success ? parsed.data : null
  } catch { return null }
}

export async function consultarAuditoria(filtros: FiltrosAuditoria) {
  const condiciones = []
  for (const clave of ['actorId', 'accion', 'cueAnexo', 'objetoId', 'resultado'] as const) {
    if (filtros[clave]) condiciones.push(eq(auditoriaEvento[clave], filtros[clave]))
  }
  if (filtros.desde) condiciones.push(gte(auditoriaEvento.ocurridoEn, new Date(filtros.desde)))
  if (filtros.hasta) condiciones.push(lt(auditoriaEvento.ocurridoEn, new Date(filtros.hasta)))
  if (filtros.cursor) {
    const cursor = decodificarCursor(filtros.cursor)
    if (!cursor) throw new Error('Cursor inválido')
    const fecha = new Date(cursor.fecha)
    condiciones.push(or(lt(auditoriaEvento.ocurridoEn, fecha), and(eq(auditoriaEvento.ocurridoEn, fecha), lt(auditoriaEvento.id, cursor.id)))!)
  }
  const filas = await getDb().select().from(auditoriaEvento).where(and(...condiciones))
    .orderBy(desc(auditoriaEvento.ocurridoEn), desc(auditoriaEvento.id)).limit(filtros.limite + 1)
  const items = filas.slice(0, filtros.limite)
  const ultima = items.at(-1)
  const nextCursor = filas.length > filtros.limite && ultima
    ? Buffer.from(JSON.stringify({ fecha: ultima.ocurridoEn.toISOString(), id: ultima.id })).toString('base64url') : null
  return { items, nextCursor }
}
