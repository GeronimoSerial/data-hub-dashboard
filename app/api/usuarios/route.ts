import { auth } from '@/lib/auth'
import { ensureSeeded } from '@/lib/db/seed'
import { getSessionUser } from '@/lib/session'
import { serverHubPathAllowedByExistingAcl } from '@/lib/hub-entry-server'
import {
  UNKNOWN_NIVELES_JUR_ERROR,
  UNKNOWN_RECURSOS_ERROR,
  authApiError,
  listHubUsers,
  listUsuariosDenied,
  mutateUsuariosDenied,
  parseCreateUserBody,
  persistUserAccessConfiguration,
  validateHubAccessSettings,
  unknownNivelJurIds,
  unknownRecursoIds,
} from '@/lib/usuarios'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  await ensureSeeded()
  const denied = listUsuariosDenied(await getSessionUser())
  if (denied) {
    return Response.json({ error: denied.error }, { status: denied.status })
  }
  return Response.json({ usuarios: await listHubUsers() }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST(request: Request) {
  await ensureSeeded()
  const denied = mutateUsuariosDenied(await getSessionUser())
  if (denied) {
    return Response.json({ error: denied.error }, { status: denied.status })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Cuerpo inválido' }, { status: 400 })
  }

  const parsed = parseCreateUserBody(body)
  if (!parsed) {
    return Response.json({ error: 'Cuerpo inválido' }, { status: 400 })
  }

  if ((await unknownNivelJurIds(parsed.nivelJurIds)).length > 0) {
    return Response.json({ error: UNKNOWN_NIVELES_JUR_ERROR }, { status: 400 })
  }

  if ((await unknownRecursoIds(parsed.recursoIds)).length > 0) {
    return Response.json({ error: UNKNOWN_RECURSOS_ERROR }, { status: 400 })
  }

  const hubAccessProvided = Boolean(body && typeof body === 'object' && 'hubAccess' in body)
  const candidate = {
    id: 'pending-user', role: parsed.role, banned: false,
    nivelJurIds: parsed.nivelJurIds, accesoRecursos: parsed.accesoRecursos,
    recursoIds: parsed.recursoIds, hubPolicy: parsed.hubPolicy,
    hubDestination: parsed.hubDestination, cueAnexo: null,
  } as const
  const noAccess = parsed.hubPolicy.landing === false && parsed.hubPolicy.enabledSections?.length === 0 && parsed.hubDestination === null
  if (hubAccessProvided && !noAccess && !(await validateHubAccessSettings(
    { hubPolicy: parsed.hubPolicy, hubDestination: parsed.hubDestination },
    (path) => serverHubPathAllowedByExistingAcl(candidate, path),
  ))) return Response.json({ error: 'Destino inválido para los permisos del usuario' }, { status: 400 })

  let createdId: string | undefined
  try {
    const created = await auth.api.createUser({
      body: {
        email: parsed.email,
        password: parsed.password,
        name: parsed.name,
        role: parsed.role,
        // Better Auth's admin createUser accepts custom user fields via `data`;
        // banned is persisted before the credential account can be used.
        data: { banned: true, banReason: 'Provisioning' },
      },
      headers: request.headers,
    })
    const id = created.user.id
    createdId = id
    await persistUserAccessConfiguration(id, {
      nivelJurIds: parsed.nivelJurIds,
      accesoRecursos: parsed.accesoRecursos,
      recursoIds: parsed.recursoIds,
      hubAccess: { hubPolicy: parsed.hubPolicy, hubDestination: parsed.hubDestination },
      // ACL rows and the enabled state commit together; a failure leaves the
      // user banned, including when best-effort deletion also fails.
      activateProvisionedUser: true,
    })
    return Response.json({ ok: true, id }, { status: 201 })
  } catch (err) {
    if (createdId) {
      try {
        await auth.api.removeUser({ body: { userId: createdId }, headers: request.headers })
      } catch {
        // Preserve the original persistence error; cleanup is best effort.
      }
    }
    const mapped = authApiError(err)
    return Response.json({ error: mapped.error }, { status: mapped.status })
  }
}
