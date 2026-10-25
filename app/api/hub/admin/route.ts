import { buildCatalogResponse } from '@/lib/db/hub-catalog-for'
import { ensureSeeded } from '@/lib/db/seed'
import { getSessionUser, staffGuard } from '@/lib/session'
import { ruta } from '@/lib/http/ruta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function handleGET() {
  await ensureSeeded()
  const user = await getSessionUser()
  const denied = staffGuard(user)
  if (denied) {
    return Response.json({ error: denied.error }, { status: denied.status })
  }
  // El staff siempre puede abrir todo (puedeAbrir es incondicional para
  // admin/editor), así que marcarAcceso solo confirma 'abrir' acá: mantiene
  // el tipo Recurso consistente con /api/hub sin cambiar el comportamiento.
  return Response.json(await buildCatalogResponse(user, { publishedOnly: false }), {
    headers: { 'Cache-Control': 'private, no-store' },
  })
}

export const GET = ruta('hub.admin.get', handleGET)
