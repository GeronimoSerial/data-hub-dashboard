import { Suspense } from 'react'
import { ExplorePage } from '@/components/explore-page'
import { requireServerHubPageAccess } from '@/lib/hub-entry-server'

export default async function Tableros() {
  await requireServerHubPageAccess('/tableros')
  return <Suspense fallback={<div className="empty-state">Cargando catálogo…</div>}><ExplorePage forcedFormato="tablero" /></Suspense>
}
