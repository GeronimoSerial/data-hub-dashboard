import { auth } from '@/lib/auth'
import { ensureSeeded } from '@/lib/db/seed'
import { getSessionUser } from '@/lib/session'
import {
  authApiError,
  listHubUsers,
  listUsuariosDenied,
  mutateUsuariosDenied,
  parseCreateUserBody,
  replaceUserNiveles,
} from '@/lib/usuarios'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  await ensureSeeded()
  const denied = listUsuariosDenied(await getSessionUser())
  if (denied) {
    return Response.json({ error: denied.error }, { status: denied.status })
  }
  return Response.json({ usuarios: await listHubUsers() })
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
    await replaceUserNiveles(id, parsed.nivelIds)
    return Response.json({ ok: true, id }, { status: 201 })
  } catch (err) {
    const mapped = authApiError(err)
    return Response.json({ error: mapped.error }, { status: mapped.status })
  }
}
