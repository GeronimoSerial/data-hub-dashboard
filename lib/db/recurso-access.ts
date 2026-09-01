import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import {
  recursos,
  recursoAudienciaNiveles,
  recursoAudienciaUsuarios,
} from '@/lib/db/schema'
import type { RecursoAccess } from '@/lib/acl'
import { seedResourceIdForRuta } from '@/lib/seed-files'

export async function loadRecursoAccess(
  id: string,
): Promise<RecursoAccess | null> {
  const db = getDb()
  const [row] = await db.select().from(recursos).where(eq(recursos.id, id))
  if (!row) return null
  const niveles = await db
    .select()
    .from(recursoAudienciaNiveles)
    .where(eq(recursoAudienciaNiveles.recursoId, id))
  const users = await db
    .select()
    .from(recursoAudienciaUsuarios)
    .where(eq(recursoAudienciaUsuarios.recursoId, id))
  return {
    estado: row.estado as RecursoAccess['estado'],
    audienciaNivelIds: niveles.map((n) => n.nivelId),
    audienciaUserIds: users.map((u) => u.userId),
  }
}

export async function loadRecursoAccessByRuta(
  ruta: string,
): Promise<{ id: string; access: RecursoAccess } | null> {
  const db = getDb()
  const seedId = seedResourceIdForRuta(ruta)
  const [row] = seedId
    ? await db.select().from(recursos).where(eq(recursos.id, seedId))
    : await db.select().from(recursos).where(eq(recursos.ruta, ruta))
  if (!row) return null
  const access = await loadRecursoAccess(row.id)
  if (!access) return null
  return { id: row.id, access }
}
