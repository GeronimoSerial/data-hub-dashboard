import { headers } from 'next/headers'
import { observarUsuarioAuditoria } from '@/lib/infraestructura/auditoria/contexto'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { user as userTable, userNivelesJur, userRecursos } from '@/lib/db/schema'
import { isStaff, type Role, type SessionUser } from '@/lib/acl'

export function staffGuard(user: SessionUser | null) {
  if (!user) return { status: 401 as const, error: 'No autenticado' }
  if (user.banned || !isStaff(user.role))
    return { status: 403 as const, error: 'No tiene acceso a este recurso' }
  return null
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return null
  const role = (session.user.role as Role | undefined) ?? 'consulta'
  const banned = Boolean(session.user.banned)
  observarUsuarioAuditoria({ id: session.user.id, role })
  const db = getDb()
  // acceso_recursos no viene en session.user (better-auth no la conoce), así
  // que se lee directo de la tabla `user`; en paralelo con las dos listas de
  // pertenencia (niveles y recursos seleccionados).
  const [nivelRows, recursoRows, [userRow]] = await Promise.all([
    db
      .select({ nivelJurisdiccionalId: userNivelesJur.nivelJurisdiccionalId })
      .from(userNivelesJur)
      .where(eq(userNivelesJur.userId, session.user.id)),
    db
      .select({ recursoId: userRecursos.recursoId })
      .from(userRecursos)
      .where(eq(userRecursos.userId, session.user.id)),
    db
      .select({ accesoRecursos: userTable.accesoRecursos, geCueAnexo: userTable.geCueAnexo })
      .from(userTable)
      .where(eq(userTable.id, session.user.id)),
  ])
  const accesoRecursos =
    userRow?.accesoRecursos === 'seleccionados' ? 'seleccionados' : 'todos'
  return {
    id: session.user.id,
    role,
    banned,
    nivelJurIds: nivelRows.map((r) => r.nivelJurisdiccionalId),
    accesoRecursos,
    recursoIds: recursoRows.map((r) => r.recursoId),
    cueAnexo: userRow?.geCueAnexo ?? null,
  }
}

/** Name and role for chrome (header) rendered on the server, so SSR and the
 *  first client render agree before the client session hook resolves. */
export type ShellUser = { name: string; role: Role }

export async function getShellUser(): Promise<ShellUser | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return null
  return {
    name: session.user.name,
    role: (session.user.role as Role | undefined) ?? 'consulta',
  }
}
