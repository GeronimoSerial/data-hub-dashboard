import { loadHubCatalog } from '@/lib/db/hub'
import { ensureSeeded } from '@/lib/db/seed'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  await ensureSeeded()
  return Response.json(await loadHubCatalog({ publishedOnly: true }))
}
