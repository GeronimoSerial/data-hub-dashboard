import { getReportesOfflineFeatures } from '@/lib/infraestructura/parte/feature-flags'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return Response.json(getReportesOfflineFeatures(), {
    headers: { 'Cache-Control': 'private, no-store' },
  })
}
