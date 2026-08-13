'use client'

import dynamic from 'next/dynamic'

const MapMatriculaPage = dynamic(
  () => import('@/components/mapas/map-matricula-page'),
  { ssr: false, loading: () => <p>Cargando mapa…</p> },
)

export default function MatriculaMapRoute() {
  return <MapMatriculaPage />
}
