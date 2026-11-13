import { ensureSeeded } from '@/lib/db/seed'
import { getSessionUser } from '@/lib/session'
import { jsonError } from '@/lib/infraestructura/respuesta-error'
import { cambioAuditado, conAuditoria } from '@/lib/infraestructura/auditoria/servidor'
import {
  listarPermisosNominales,
  otorgarPermisoNominal,
  revocarPermisoNominal,
} from '@/lib/infraestructura/permiso-nominal'
import { ruta } from '@/lib/http/ruta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// La administración del permiso nominal es exclusiva de 'admin'. No usa
// staffGuard porque staffGuard también deja pasar a 'editor', y acá el rol
// que hace falta es más estricto que "es staff".
function adminGuard(user: Awaited<ReturnType<typeof getSessionUser>>) {
  if (!user) return { status: 401 as const, error: 'No autenticado' }
  if (user.banned || user.role !== 'admin')
    return { status: 403 as const, error: 'No tiene acceso a este recurso' }
  return null
}

async function handleGET() {
  await ensureSeeded()
  const user = await getSessionUser()
  const guard = adminGuard(user)
  if (guard) return Response.json({ error: guard.error }, { status: guard.status })

  const permisos = await listarPermisosNominales()
  return Response.json({ permisos })
}

async function handlePOST(request: Request) {
  await ensureSeeded()
  const user = await getSessionUser()
  const guard = adminGuard(user)
  if (guard) return Response.json({ error: guard.error }, { status: guard.status })

  const body = await request.json().catch(() => null)
  const userId = typeof body?.userId === 'string' ? body.userId.trim() : ''
  const venceEnRaw = typeof body?.venceEn === 'string' ? body.venceEn : ''
  const venceEn = venceEnRaw ? new Date(venceEnRaw) : null

  if (!userId || !venceEn || Number.isNaN(venceEn.getTime())) {
    return jsonError('userId y venceEn (fecha ISO) son obligatorios', 400)
  }
  if (venceEn.getTime() <= Date.now()) {
    return Response.json({ error: 'venceEn debe ser una fecha futura' }, { status: 400 })
  }

  const permiso = await cambioAuditado(
    () => otorgarPermisoNominal({
      userId,
      otorgadoPor: user!.id,
      venceEn,
    }),
    valor => ({ status: 201, objetoTipo: 'permiso_nominal', objetoId: valor.id, metadatos: { permisoId: valor.id } }),
  )
  return Response.json({ permiso }, { status: 201 })
}

async function handleDELETE(request: Request) {
  await ensureSeeded()
  const user = await getSessionUser()
  const guard = adminGuard(user)
  if (guard) return Response.json({ error: guard.error }, { status: guard.status })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return Response.json({ error: 'Falta id' }, { status: 400 })

  await cambioAuditado(
    () => revocarPermisoNominal(id),
    () => ({ status: 200, objetoTipo: 'permiso_nominal', objetoId: id, metadatos: { permisoId: id } }),
  )
  return Response.json({ ok: true })
}

export const GET = ruta('infraestructura.nominal.permisos.get', handleGET)
export const POST = conAuditoria(
  'permiso_nominal.otorgar',
  '/api/infraestructura/nominal/permisos',
  ruta('infraestructura.nominal.permisos.post', handlePOST),
)
export const DELETE = conAuditoria(
  'permiso_nominal.revocar',
  '/api/infraestructura/nominal/permisos',
  ruta('infraestructura.nominal.permisos.delete', handleDELETE),
)
