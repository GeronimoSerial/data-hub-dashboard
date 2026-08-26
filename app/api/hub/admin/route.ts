import { loadHubCatalog } from '@/lib/db/hub'
import { ensureSeeded } from '@/lib/db/seed'
import { getSessionUser, staffGuard } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  await ensureSeeded()
  const denied = staffGuard(await getSessionUser())
  if (denied) {
    return Response.json({ error: denied.error }, { status: denied.status })
  }
  return Response.json(await loadHubCatalog({ publishedOnly: false }))
}
