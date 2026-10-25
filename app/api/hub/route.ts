import { buildCatalogResponse } from '@/lib/db/hub-catalog-for'
import { ensureSeeded } from '@/lib/db/seed'
import { getSessionUser } from '@/lib/session'
import { ruta } from '@/lib/http/ruta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function handleGET() {
  await ensureSeeded()
  const user = await getSessionUser()
  return Response.json(await buildCatalogResponse(user, { publishedOnly: true }))
}

export const GET = ruta('hub.get', handleGET)
