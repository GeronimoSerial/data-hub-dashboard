'use client'

import dynamic from 'next/dynamic'

// Carga diferida sin SSR, mismo patrón que InfraestructuraMapClient
// (app/(hub)/mapas/infraestructura/map-client.tsx): MapLibre depende del DOM
// y del worker de tiles, no puede renderizarse en el servidor.
const MapNatalidadPage = dynamic(() => import('@/components/mapas/map-natalidad-page'), {
  ssr: false,
  loading: () => <p>Cargando mapa…</p>,
})

export function NatalidadMapClient() {
  return <MapNatalidadPage />
}
