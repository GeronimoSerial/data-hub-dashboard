'use client'

import { Minus, Plus, Scan } from 'lucide-react'
import type { RefObject } from 'react'
import type { MapRef } from 'react-map-gl/maplibre'
import { useTextos } from '@/lib/i18n/idioma-provider'

type Props = {
  mapRef: RefObject<MapRef | null>
  /** Vuelve al encuadre de toda la provincia. */
  onVerProvincia: () => void
}

// Controles propios en vez de NavigationControl: botones con el estilo del hub
// y un acceso explícito para volver a ver la provincia.
export function ControlesZoom({ mapRef, onVerProvincia }: Props) {
  const t = useTextos().controles.zoom
  const zoom = (delta: number) => {
    const mapa = mapRef.current?.getMap()
    if (!mapa) return
    if (delta > 0) mapa.zoomIn({ duration: 250 })
    else mapa.zoomOut({ duration: 250 })
  }
  return (
    <div className="map-zoom-controles" role="group" aria-label={t.grupo}>
      <button type="button" className="map-zoom-boton" aria-label={t.acercar} title={t.acercar} onClick={() => zoom(1)}>
        <Plus aria-hidden size={18} strokeWidth={2} />
      </button>
      <button type="button" className="map-zoom-boton" aria-label={t.alejar} title={t.alejar} onClick={() => zoom(-1)}>
        <Minus aria-hidden size={18} strokeWidth={2} />
      </button>
      <button
        type="button"
        className="map-zoom-boton map-zoom-provincia"
        aria-label={t.verToda}
        title={t.verToda}
        onClick={onVerProvincia}
      >
        <Scan aria-hidden size={16} strokeWidth={2} />
        <span>{t.verProvincia}</span>
      </button>
    </div>
  )
}
