import { headers } from 'next/headers'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { userNiveles } from '@/lib/db/schema'
import { isStaff, type Role, type SessionUser } from '@/lib/acl'

export function staffGuard(user: SessionUser | null) {
  if (!user) return { status: 401 as const, error: 'No autenticado' }
  if (user.banned || !isStaff(user.role))
    return { status: 403 as const, error: 'No tenés acceso a este recurso' }
  return null
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return null
  const role = (session.user.role as Role | undefined) ?? 'consulta'
  const banned = Boolean(session.user.banned)
  const rows = await getDb()
    .select({ nivelId: userNiveles.nivelId })
    .from(userNiveles)
    .where(eq(userNiveles.userId, session.user.id))
  return {
    id: session.user.id,
    role,
    banned,
    nivelIds: rows.map((r) => r.nivelId),
  }
}
