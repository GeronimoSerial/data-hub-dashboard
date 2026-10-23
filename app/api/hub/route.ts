import { buildCatalogResponse } from '@/lib/db/hub-catalog-for'
import { ensureSeeded } from '@/lib/db/seed'
import { getSessionUser } from '@/lib/session'
import { hubApiAccessResponse } from '@/lib/hub-entry-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  await ensureSeeded()
  const user = await getSessionUser()
  const denied = await hubApiAccessResponse(user, '/explorar')
  if (denied) return denied
  return Response.json(await buildCatalogResponse(user, { publishedOnly: true }), {
    headers: { 'Cache-Control': 'private, no-store' },
  })
}
