import { buildCatalogResponse } from '@/lib/db/hub-catalog-for'
import { ensureSeeded } from '@/lib/db/seed'
import { getSessionUser } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  await ensureSeeded()
  const user = await getSessionUser()
  return Response.json(await buildCatalogResponse(user, { publishedOnly: true }))
}
