import { ensureSeeded } from '@/lib/db/seed'
import { getSessionUser, staffGuard } from '@/lib/session'
import { obtenerEstadoOperativo } from '@/lib/infraestructura/riesgo/salud'
import { respuestaGuard } from '@/lib/infraestructura/respuesta-guard'
import { jsonNoStore } from '@/lib/infraestructura/respuesta-no-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  await ensureSeeded()
  const user = await getSessionUser()
  const guard = staffGuard(user)
  if (guard) return respuestaGuard(guard)

  const estado = await obtenerEstadoOperativo()
  return jsonNoStore(estado)
}
