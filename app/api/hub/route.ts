import { filtrarVisibles } from '@/lib/acl'
import { loadHubCatalog } from '@/lib/db/hub'
import { ensureSeeded } from '@/lib/db/seed'
import { getSessionUser } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  await ensureSeeded()
  const user = await getSessionUser()
  const catalog = await loadHubCatalog({ publishedOnly: true })
  return Response.json({
    ...catalog,
    recursos: filtrarVisibles(user, catalog.recursos),
  })
}
