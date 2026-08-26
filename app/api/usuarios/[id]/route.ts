import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { user } from '@/lib/db/schema'
import { ensureSeeded } from '@/lib/db/seed'
import { getSessionUser } from '@/lib/session'
import {
  LAST_ADMIN_ERROR,
  authApiError,
  mutateUsuariosDenied,
  parsePatchUserBody,
  replaceUserNiveles,
  unbannedAdminIds,
  wouldRemoveLastAdmin,
} from '@/lib/usuarios'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, ctx: Ctx) {
  await ensureSeeded()
  const denied = mutateUsuariosDenied(await getSessionUser())
  if (denied) {
    return Response.json({ error: denied.error }, { status: denied.status })
  }

  const { id } = await ctx.params
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Cuerpo inválido' }, { status: 400 })
  }

  const parsed = parsePatchUserBody(body)
  if (!parsed) {
    return Response.json({ error: 'Cuerpo inválido' }, { status: 400 })
  }

  const [existing] = await getDb()
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, id))
  if (!existing) {
    return Response.json({ error: 'Usuario no encontrado' }, { status: 404 })
  }

  const admins = await unbannedAdminIds()
  if (
    wouldRemoveLastAdmin({
      targetId: id,
      unbannedAdminIds: admins,
      nextRole: parsed.role,
      nextBanned: parsed.banned,
    })
  ) {
    return Response.json({ error: LAST_ADMIN_ERROR }, { status: 400 })
  }

  const headers = request.headers
  try {
    if (parsed.role) {
      await auth.api.setRole({
        body: { userId: id, role: parsed.role },
        headers,
      })
    }
    if (parsed.banned === true) {
      await auth.api.banUser({ body: { userId: id }, headers })
    } else if (parsed.banned === false) {
      await auth.api.unbanUser({ body: { userId: id }, headers })
    }
    if (parsed.password) {
      await auth.api.setUserPassword({
        body: { userId: id, newPassword: parsed.password },
        headers,
      })
    }
    if (parsed.name) {
      await auth.api.adminUpdateUser({
        body: { userId: id, data: { name: parsed.name } },
        headers,
      })
    }
    if (parsed.nivelIds) {
      await replaceUserNiveles(id, parsed.nivelIds)
    }
  } catch (err) {
    const mapped = authApiError(err)
    return Response.json({ error: mapped.error }, { status: mapped.status })
  }

  return Response.json({ ok: true, id })
}
