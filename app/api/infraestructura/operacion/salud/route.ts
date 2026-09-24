import { ensureSeeded } from '@/lib/db/seed'
import { getSessionUser, staffGuard } from '@/lib/session'
import { obtenerEstadoOperativo } from '@/lib/infraestructura/riesgo/salud'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  await ensureSeeded()
  const user = await getSessionUser()
  const guard = staffGuard(user)
  if (guard) {
    return Response.json(
      { error: guard.error },
      { status: guard.status, headers: { 'Cache-Control': 'private, no-store' } },
    )
  }

  const estado = await obtenerEstadoOperativo()
  return Response.json(estado, {
    status: 200,
    headers: { 'Cache-Control': 'private, no-store' },
  })
}
