import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import {
  recursos,
  recursoAudienciaNivelesJur,
  recursoAudienciaUsuarios,
} from '@/lib/db/schema'
import type { RecursoAccess } from '@/lib/acl'

export async function loadRecursoAccess(
  id: string,
): Promise<RecursoAccess | null> {
  const db = getDb()
  const [row] = await db.select().from(recursos).where(eq(recursos.id, id))
  if (!row) return null
  const niveles = await db
    .select()
    .from(recursoAudienciaNivelesJur)
    .where(eq(recursoAudienciaNivelesJur.recursoId, id))
  const users = await db
    .select()
    .from(recursoAudienciaUsuarios)
    .where(eq(recursoAudienciaUsuarios.recursoId, id))
  return {
    id: row.id,
    estado: row.estado as RecursoAccess['estado'],
    audienciaNivelJurIds: niveles.map((n) => n.nivelJurisdiccionalId),
    audienciaUserIds: users.map((u) => u.userId),
  }
}

export async function loadRecursoAccessByRuta(
  ruta: string,
): Promise<{ id: string; access: RecursoAccess } | null> {
  const db = getDb()
  const [row] = await db.select().from(recursos).where(eq(recursos.ruta, ruta))
  if (!row) return null
  const access = await loadRecursoAccess(row.id)
  if (!access) return null
  return { id: row.id, access }
}
