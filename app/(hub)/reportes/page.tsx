import { Suspense } from 'react'
import { ExplorePage } from '@/components/explore-page'
import { requireServerHubPageAccess } from '@/lib/hub-entry-server'

export default async function Reportes() {
  await requireServerHubPageAccess('/reportes')
  return <Suspense fallback={<div className="empty-state">Cargando catálogo…</div>}><ExplorePage forcedFormato="reporte" /></Suspense>
}
