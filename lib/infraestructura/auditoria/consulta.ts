import { and, desc, eq, gte, lt, sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/lib/db'
import { auditoriaEvento, user } from '@/lib/db/schema'

// Misma regla que referencia() en servidor.ts: lo que el escritor no puede guardar no se puede filtrar.
const REFERENCIA = /^[\p{L}\p{N}_.:-]{1,128}$/u
const referencia = z.string().regex(REFERENCIA)
const fechaConZona = z.iso.datetime({ offset: true })
const RESULTADOS = ['pendiente', 'exito', 'rechazado', 'invalido', 'conflicto', 'repetido', 'sin_cambio', 'error'] as const

type CursorAuditoria = { fecha: string; id: string }

function leerCursor(valor: string): CursorAuditoria | null {
  try {
    const datos = JSON.parse(Buffer.from(valor, 'base64url').toString('utf8'))
    const parsed = z.object({ fecha: fechaConZona, id: z.uuid() }).strict().safeParse(datos)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/** Cursor opaco: base64url de {fecha, id} del último evento devuelto. Un valor forjado o mal formado no se acepta. */
export const consultaAuditoriaSchema = z.object({
  actorId: referencia.optional(),
  accion: referencia.optional(),
  cueAnexo: referencia.optional(),
  objetoId: referencia.optional(),
  resultado: z.enum(RESULTADOS).optional(),
  desde: fechaConZona.optional(),
  hasta: fechaConZona.optional(),
  cursor: z.string().refine(valor => leerCursor(valor) !== null).optional(),
  limite: z.coerce.number().int().min(1).max(100).default(50),
}).strict().refine(
  filtros => !filtros.desde || !filtros.hasta || Date.parse(filtros.desde) < Date.parse(filtros.hasta),
  { message: 'desde debe ser anterior a hasta' },
)

export type FiltrosAuditoria = z.output<typeof consultaAuditoriaSchema>
export type EventoAuditoria = typeof auditoriaEvento.$inferSelect
/** Nombre y correo del usuario cuyo id es actor_id; null si el actor no es un usuario. Solo esas dos columnas salen de la tabla user. */
export type EventoAuditoriaConActor = EventoAuditoria & { actorNombre: string | null; actorCorreo: string | null }
export type PaginaAuditoria = { items: EventoAuditoriaConActor[]; nextCursor: string | null }

function codificarCursor(evento: EventoAuditoria): string {
  return Buffer.from(JSON.stringify({ fecha: evento.ocurridoEn.toISOString(), id: evento.id })).toString('base64url')
}

/**
 * Página por keyset sobre (ocurrido_en DESC, id DESC). La comparación por fila usa el índice
 * auditoria_evento_fecha_idx; no hay COUNT ni carga de historia completa.
 * Los eventos se guardan con precisión de milisegundos (Date de JS), así que el cursor no pierde filas.
 */
export async function consultarAuditoria(filtros: FiltrosAuditoria): Promise<PaginaAuditoria> {
  const condiciones: SQL[] = []
  if (filtros.actorId) condiciones.push(eq(auditoriaEvento.actorId, filtros.actorId))
  if (filtros.accion) condiciones.push(eq(auditoriaEvento.accion, filtros.accion))
  if (filtros.cueAnexo) condiciones.push(eq(auditoriaEvento.cueAnexo, filtros.cueAnexo))
  if (filtros.objetoId) condiciones.push(eq(auditoriaEvento.objetoId, filtros.objetoId))
  if (filtros.resultado) condiciones.push(eq(auditoriaEvento.resultado, filtros.resultado))
  if (filtros.desde) condiciones.push(gte(auditoriaEvento.ocurridoEn, new Date(filtros.desde)))
  if (filtros.hasta) condiciones.push(lt(auditoriaEvento.ocurridoEn, new Date(filtros.hasta)))
  if (filtros.cursor) {
    const cursor = leerCursor(filtros.cursor)
    if (!cursor) throw new Error('cursor inválido')
    condiciones.push(sql`(${auditoriaEvento.ocurridoEn}, ${auditoriaEvento.id}) < (${cursor.fecha}::timestamptz, ${cursor.id}::text)`)
  }

  // El LIMIT va en la subconsulta: el join con user solo toca las filas de la página.
  const pagina = getDb().select().from(auditoriaEvento).where(and(...condiciones))
    .orderBy(desc(auditoriaEvento.ocurridoEn), desc(auditoriaEvento.id))
    .limit(filtros.limite + 1)
    .as('pagina')
  const filas: EventoAuditoriaConActor[] = await getDb()
    .select({ ...pagina._.selectedFields, actorNombre: user.name, actorCorreo: user.email })
    .from(pagina)
    .leftJoin(user, eq(user.id, pagina.actorId))
    .orderBy(desc(pagina.ocurridoEn), desc(pagina.id))
  const items = filas.slice(0, filtros.limite)
  const ultimo = items.at(-1)
  const nextCursor = filas.length > filtros.limite && ultimo ? codificarCursor(ultimo) : null
  return { items, nextCursor }
}
