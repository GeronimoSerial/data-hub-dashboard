import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { user } from '@/lib/db/schema'
import { ensureSeeded } from '@/lib/db/seed'
import { getSessionUser } from '@/lib/session'
import { serverHubPathAllowedByExistingAcl } from '@/lib/hub-entry-server'
import {
  LAST_ADMIN_ERROR,
  UNKNOWN_NIVELES_JUR_ERROR,
  UNKNOWN_RECURSOS_ERROR,
  authApiError,
  getHubUserSession,
  listHubUsers,
  listUsuariosDenied,
  mutateUsuariosDenied,
  parsePatchUserBody,
  persistUserAccessConfiguration,
  validateHubAccessSettings,
  unbannedAdminIds,
  unknownNivelJurIds,
  unknownRecursoIds,
  wouldRemoveLastAdmin,
} from '@/lib/usuarios'
import { ruta } from '@/lib/http/ruta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

async function handleGET(_request: Request, ctx: Ctx) {
  await ensureSeeded()
  const denied = listUsuariosDenied(await getSessionUser())
  if (denied) return Response.json({ error: denied.error }, { status: denied.status })
  const { id } = await ctx.params
  const target = (await listHubUsers()).find((item) => item.id === id)
  if (!target) return Response.json({ error: 'Usuario no encontrado' }, { status: 404 })
  return Response.json({ usuario: target }, { headers: { 'Cache-Control': 'private, no-store' } })
}

async function handlePATCH(request: Request, ctx: Ctx) {
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

  if (
    parsed.nivelJurIds &&
    (await unknownNivelJurIds(parsed.nivelJurIds)).length > 0
  ) {
    return Response.json({ error: UNKNOWN_NIVELES_JUR_ERROR }, { status: 400 })
  }

  if (
    parsed.recursoIds &&
    (await unknownRecursoIds(parsed.recursoIds)).length > 0
  ) {
    return Response.json({ error: UNKNOWN_RECURSOS_ERROR }, { status: 400 })
  }

  const [existing] = await getDb()
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, id))
  if (!existing) {
    return Response.json({ error: 'Usuario no encontrado' }, { status: 404 })
  }

  if (parsed.hubPolicy || parsed.hubDestination !== undefined || parsed.role || parsed.nivelJurIds || parsed.accesoRecursos || parsed.recursoIds) {
    const current = await getHubUserSession(id)
    if (!current) return Response.json({ error: 'Usuario no encontrado' }, { status: 404 })
    const target = {
      ...current,
      // Destination validation evaluates intended permissions independently of
      // the reversible ban flag. Runtime session/page guards still deny bans.
      banned: false,
      role: parsed.role ?? current.role,
      nivelJurIds: parsed.nivelJurIds ?? current.nivelJurIds,
      accesoRecursos: parsed.accesoRecursos ?? current.accesoRecursos,
      recursoIds: parsed.recursoIds ?? current.recursoIds,
      hubPolicy: parsed.hubPolicy ?? current.hubPolicy,
      hubDestination: parsed.hubDestination !== undefined ? parsed.hubDestination : current.hubDestination,
    }
    const noAccess = target.hubPolicy?.landing === false && target.hubPolicy.enabledSections?.length === 0 && target.hubDestination === null
    if (!noAccess && !(await validateHubAccessSettings(
      { hubPolicy: target.hubPolicy ?? {}, hubDestination: target.hubDestination ?? null },
      (path) => serverHubPathAllowedByExistingAcl(target, path),
    ))) return Response.json({ error: 'Destino inválido para los permisos del usuario' }, { status: 400 })
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
    if (parsed.nivelJurIds !== undefined || parsed.accesoRecursos !== undefined || parsed.recursoIds !== undefined || parsed.hubPolicy || parsed.hubDestination !== undefined) {
      await persistUserAccessConfiguration(id, {
        nivelJurIds: parsed.nivelJurIds,
        accesoRecursos: parsed.accesoRecursos,
        recursoIds: parsed.recursoIds,
        ...(parsed.hubPolicy || parsed.hubDestination !== undefined ? {
          hubAccess: {
            hubPolicy: parsed.hubPolicy ?? (await getHubUserSession(id))?.hubPolicy ?? {},
            hubDestination: parsed.hubDestination !== undefined ? parsed.hubDestination : (await getHubUserSession(id))?.hubDestination ?? null,
          },
        } : {}),
      })
    }
  } catch (err) {
    const mapped = authApiError(err)
    return Response.json({ error: mapped.error }, { status: mapped.status })
  }

  return Response.json({ ok: true, id })
}

export const GET = ruta('usuarios.id.get', handleGET)
export const PATCH = ruta('usuarios.id.patch', handlePATCH)
