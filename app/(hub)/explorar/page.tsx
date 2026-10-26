import { Suspense } from 'react'
import { ExplorePage } from '@/components/explore-page'
import { requireServerHubPageAccess } from '@/lib/hub-entry-server'

export const metadata = {
  title: 'Explorar · Hub de Datos',
  description: 'Buscar información educativa por tema, nivel y formato.',
}

export default async function Explorar() {
  await requireServerHubPageAccess('/explorar')
  return <Suspense fallback={<div className="empty-state">Cargando catálogo…</div>}><ExplorePage /></Suspense>
}
