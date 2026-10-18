'use client'

import { Minus, Plus, Scan } from 'lucide-react'
import type { RefObject } from 'react'
import type { MapRef } from 'react-map-gl/maplibre'

type Props = {
  mapRef: RefObject<MapRef | null>
  /** Vuelve al encuadre de toda la provincia. */
  onVerProvincia: () => void
}

// Controles propios en vez de NavigationControl: botones con el estilo del hub,
// etiquetas en español y un acceso explícito para volver a ver la provincia.
export function ControlesZoom({ mapRef, onVerProvincia }: Props) {
  const zoom = (delta: number) => {
    const mapa = mapRef.current?.getMap()
    if (!mapa) return
    if (delta > 0) mapa.zoomIn({ duration: 250 })
    else mapa.zoomOut({ duration: 250 })
  }
  return (
    <div className="map-zoom-controles" role="group" aria-label="Zoom del mapa">
      <button type="button" className="map-zoom-boton" aria-label="Acercar" title="Acercar" onClick={() => zoom(1)}>
        <Plus aria-hidden size={18} strokeWidth={2} />
      </button>
      <button type="button" className="map-zoom-boton" aria-label="Alejar" title="Alejar" onClick={() => zoom(-1)}>
        <Minus aria-hidden size={18} strokeWidth={2} />
      </button>
      <button
        type="button"
        className="map-zoom-boton map-zoom-provincia"
        aria-label="Ver toda la provincia"
        title="Ver toda la provincia"
        onClick={onVerProvincia}
      >
        <Scan aria-hidden size={16} strokeWidth={2} />
        <span>Ver provincia</span>
      </button>
    </div>
  )
}
