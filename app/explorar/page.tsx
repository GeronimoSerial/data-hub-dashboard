import { Suspense } from 'react'
import { ExplorePage } from '@/components/explore-page'

export const metadata = {
  title: 'Explorar · Hub de Datos',
  description: 'Buscá información educativa por tema, nivel y formato.',
}

export default function Explorar() {
  return <Suspense fallback={<div className="empty-state">Cargando catálogo…</div>}><ExplorePage /></Suspense>
}
