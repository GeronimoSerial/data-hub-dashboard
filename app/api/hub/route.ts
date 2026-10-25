import { buildCatalogResponse } from '@/lib/db/hub-catalog-for'
import { ensureSeeded } from '@/lib/db/seed'
import { getSessionUser } from '@/lib/session'
import { hubApiAccessResponse } from '@/lib/hub-entry-server'
import { ruta } from '@/lib/http/ruta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function handleGET() {
  await ensureSeeded()
  const user = await getSessionUser()
  const denied = await hubApiAccessResponse(user, '/explorar')
  if (denied) return denied
  return Response.json(await buildCatalogResponse(user, { publishedOnly: true }), {
    headers: { 'Cache-Control': 'private, no-store' },
  })
}

export const GET = ruta('hub.get', handleGET)
