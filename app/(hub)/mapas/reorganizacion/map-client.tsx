'use client'

import * as React from 'react'
import dynamic from 'next/dynamic'

// Carga diferida sin SSR, mismo patrón que app/(hub)/mapas/natalidad/map-client.tsx:
// MapLibre depende del DOM y del worker de tiles, no puede renderizarse en el servidor.
const MapReorganizacionPage = dynamic(() => import('@/components/mapas/map-reorganizacion-page'), {
  ssr: false,
  loading: () => <p>Cargando mapa…</p>,
})

// Una sola vista: el mapa ocupa todo el alto disponible sin barra de pestañas.
export function ReorganizacionMapClient() {
  return (
    <div className="mapa-pestanas">
      <div className="mapa-pestanas-cuerpo">
        <div className="mapa-pestana-panel">
          <MapReorganizacionPage visible={true} />
        </div>
      </div>
    </div>
  )
}
