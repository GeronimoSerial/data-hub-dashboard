'use client'

import { mergeClasses } from '@fluentui/react-components'
import { useRef, useState } from 'react'
import type { MapRef } from 'react-map-gl/maplibre'
import { BasemapControl } from '@/components/mapas/basemap-control'
import { FullscreenButton } from '@/components/mapas/fullscreen-button'
import { LayerControl } from '@/components/mapas/layer-control'
import { LegendPanel } from '@/components/mapas/legend-panel'
import { MapView } from '@/components/mapas/map-view'
import { SearchBox } from '@/components/mapas/search-box'
import { TitlePanel } from '@/components/mapas/title-panel'
import { useOverlayStyles } from '@/components/mapas/overlay-styles'
import type { BasemapId, OverlayKey, SelectedFeature } from '@/lib/map-types'
import { ensureMapWorker } from '@/lib/map-worker'
import { useMapData } from '@/lib/use-map-data'

ensureMapWorker()

const DEFAULT_OVERLAYS: Record<OverlayKey, boolean> = {
  zones: true,
  down: true,
  up: true,
  flat: true,
  partial: true,
  localities: true,
}

export default function MapMatriculaPage() {
  const styles = useOverlayStyles()
  const { data, error, loading } = useMapData()
  const shellRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapRef>(null)
  const [basemap, setBasemap] = useState<BasemapId>('voyager')
  const [overlays, setOverlays] =
    useState<Record<OverlayKey, boolean>>(DEFAULT_OVERLAYS)
  const [selected, setSelected] = useState<SelectedFeature | null>(null)

  if (loading) {
    return <div className={styles.status}>Cargando mapa…</div>
  }

  if (error || !data) {
    return (
      <div className={mergeClasses(styles.status, styles.statusError)}>
        {error ?? 'No hay datos. Ejecutá pnpm extract.'}
      </div>
    )
  }

  return (
    <div className={styles.shell} ref={shellRef}>
      <MapView
        data={data}
        basemap={basemap}
        overlays={overlays}
        selected={selected}
        onSelect={setSelected}
        mapRef={mapRef}
      />

      <TitlePanel summary={data.summary} />
      <LegendPanel summary={data.summary} />

      <div className={styles.controlsStack}>
        <SearchBox
          data={data}
          onSelect={(hit) => {
            setSelected({
              kind: 'establishment',
              coordinates: hit.coordinates,
              properties: hit.properties,
            })
            mapRef.current?.flyTo({
              center: hit.coordinates,
              zoom: 12,
              duration: 1200,
            })
          }}
        />
        <BasemapControl value={basemap} onChange={setBasemap} />
        <LayerControl
          overlays={overlays}
          onChange={(key, value) =>
            setOverlays((prev) => ({ ...prev, [key]: value }))
          }
        />
      </div>

      <FullscreenButton targetRef={shellRef} />
    </div>
  )
}
