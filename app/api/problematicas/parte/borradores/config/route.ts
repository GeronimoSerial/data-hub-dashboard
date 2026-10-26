import { getReportesOfflineFeatures } from '@/lib/infraestructura/parte/feature-flags'
import { ruta } from '@/lib/http/ruta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function handleGET() {
  return Response.json(getReportesOfflineFeatures(), {
    headers: { 'Cache-Control': 'private, no-store' },
  })
}

export const GET = ruta('parte.borradores.config.get', handleGET)
