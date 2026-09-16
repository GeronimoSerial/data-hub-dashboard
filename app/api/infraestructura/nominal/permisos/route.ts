import { ensureSeeded } from '@/lib/db/seed'
import { getSessionUser } from '@/lib/session'
import {
  listarPermisosNominales,
  otorgarPermisoNominal,
  revocarPermisoNominal,
} from '@/lib/infraestructura/permiso-nominal'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// La administración del permiso nominal es exclusiva de 'admin'. No usa
// staffGuard porque staffGuard también deja pasar a 'editor', y acá el rol
// que hace falta es más estricto que "es staff".
function adminGuard(user: Awaited<ReturnType<typeof getSessionUser>>) {
  if (!user) return { status: 401 as const, error: 'No autenticado' }
  if (user.banned || user.role !== 'admin')
    return { status: 403 as const, error: 'No tenés acceso a este recurso' }
  return null
}

export async function GET() {
  await ensureSeeded()
  const user = await getSessionUser()
  const guard = adminGuard(user)
  if (guard) return Response.json({ error: guard.error }, { status: guard.status })

  const permisos = await listarPermisosNominales()
  return Response.json({ permisos })
}

export async function POST(request: Request) {
  await ensureSeeded()
  const user = await getSessionUser()
  const guard = adminGuard(user)
  if (guard) return Response.json({ error: guard.error }, { status: guard.status })

  const body = await request.json().catch(() => null)
  const userId = typeof body?.userId === 'string' ? body.userId.trim() : ''
  const venceEnRaw = typeof body?.venceEn === 'string' ? body.venceEn : ''
  const venceEn = venceEnRaw ? new Date(venceEnRaw) : null

  if (!userId || !venceEn || Number.isNaN(venceEn.getTime())) {
    return Response.json(
      { error: 'userId y venceEn (fecha ISO) son obligatorios' },
      { status: 400 },
    )
  }
  if (venceEn.getTime() <= Date.now()) {
    return Response.json({ error: 'venceEn debe ser una fecha futura' }, { status: 400 })
  }

  const permiso = await otorgarPermisoNominal({
    userId,
    otorgadoPor: user!.id,
    venceEn,
  })
  return Response.json({ permiso }, { status: 201 })
}

export async function DELETE(request: Request) {
  await ensureSeeded()
  const user = await getSessionUser()
  const guard = adminGuard(user)
  if (guard) return Response.json({ error: guard.error }, { status: guard.status })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return Response.json({ error: 'Falta id' }, { status: 400 })

  await revocarPermisoNominal(id)
  return Response.json({ ok: true })
}
