'use client'

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
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
import {
  createMapStateSettler,
  parseMapViewState,
  replaceMapViewParams,
  type MapViewStateSettler,
} from '@/lib/map-share'

ensureMapWorker()

const DEFAULT_OVERLAYS: Record<OverlayKey, boolean> = {
  zones: true,
  sobreoferta: false,
  down: true,
  up: true,
  flat: true,
  partial: true,
  localities: true,
}

export default function MapMatriculaPage() {
  const styles = useOverlayStyles()
  const searchParams = useSearchParams()
  const { data, error, loading } = useMapData()
  const shellRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapRef>(null)
  const [basemap, setBasemap] = useState<BasemapId>('voyager')
  const [overlays, setOverlays] =
    useState<Record<OverlayKey, boolean>>(DEFAULT_OVERLAYS)
  const [selected, setSelected] = useState<SelectedFeature | null>(null)
  const settlerRef = useRef<MapViewStateSettler | null>(null)
  if (settlerRef.current == null) {
    settlerRef.current = createMapStateSettler(replaceMapViewParams)
  }

  useEffect(() => {
    const settler = settlerRef.current
    if (!settler) return
    const onPopState = () => {
      // Restore the view from the URL after back/forward navigation.
      settler.cancel()
      const restored = parseMapViewState(new URLSearchParams(window.location.search))
      if (restored.longitude != null && restored.latitude != null && restored.zoom != null) {
        mapRef.current?.flyTo({
          center: [restored.longitude, restored.latitude],
          zoom: restored.zoom,
          duration: 500,
        })
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => {
      window.removeEventListener('popstate', onPopState)
      settler.flush()
    }
  }, [])

  const initialView = parseMapViewState(searchParams)

  if (loading) {
    return <div className={styles.status}>Cargando mapa…</div>
  }

  if (error || !data) {
    return (
      <div className={`${styles.status} ${styles.statusError}`}>
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
        initialViewState={initialView}
        onMove={(state) => settlerRef.current?.schedule(state)}
      />

      <TitlePanel summary={data.summary} />
      <LegendPanel
        summary={data.summary}
        sobreofertaOn={overlays.sobreoferta}
        sobreoferta={data.sobreoferta}
      />

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