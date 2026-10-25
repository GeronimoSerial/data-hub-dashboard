import { ensureSeeded } from '@/lib/db/seed'
import { getSessionUser, staffGuard } from '@/lib/session'
import { obtenerEstadoOperativo } from '@/lib/infraestructura/riesgo/salud'
import { respuestaGuard } from '@/lib/infraestructura/respuesta-guard'
import { jsonNoStore } from '@/lib/infraestructura/respuesta-no-store'
import { ruta } from '@/lib/http/ruta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function handleGET() {
  await ensureSeeded()
  const user = await getSessionUser()
  const guard = staffGuard(user)
  if (guard) return respuestaGuard(guard)

  const estado = await obtenerEstadoOperativo()
  return jsonNoStore(estado)
}

export const GET = ruta('infraestructura.operacion.salud.get', handleGET)
