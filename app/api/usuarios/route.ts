import { auth } from '@/lib/auth'
import { ensureSeeded } from '@/lib/db/seed'
import { getSessionUser } from '@/lib/session'
import {
  UNKNOWN_NIVELES_JUR_ERROR,
  UNKNOWN_RECURSOS_ERROR,
  authApiError,
  listHubUsers,
  listUsuariosDenied,
  mutateUsuariosDenied,
  parseCreateUserBody,
  replaceUserNivelesJur,
  replaceUserRecursos,
  setAccesoRecursos,
  unknownNivelJurIds,
  unknownRecursoIds,
} from '@/lib/usuarios'
import { ruta } from '@/lib/http/ruta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function handleGET() {
  await ensureSeeded()
  const denied = listUsuariosDenied(await getSessionUser())
  if (denied) {
    return Response.json({ error: denied.error }, { status: denied.status })
  }
  return Response.json({ usuarios: await listHubUsers() })
}

async function handlePOST(request: Request) {
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

  try {
    const created = await auth.api.createUser({
      body: {
        email: parsed.email,
        password: parsed.password,
        name: parsed.name,
        role: parsed.role,
      },
      headers: request.headers,
    })
    const id = created.user.id
    await replaceUserNivelesJur(id, parsed.nivelJurIds)
    await setAccesoRecursos(id, parsed.accesoRecursos)
    await replaceUserRecursos(id, parsed.recursoIds)
    return Response.json({ ok: true, id }, { status: 201 })
  } catch (err) {
    const mapped = authApiError(err)
    return Response.json({ error: mapped.error }, { status: mapped.status })
  }
}

export const GET = ruta('usuarios.get', handleGET)
export const POST = ruta('usuarios.post', handlePOST)
