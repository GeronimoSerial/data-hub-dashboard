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
  DEFAULT_MAP_BASEMAP,
  DEFAULT_MAP_OVERLAYS,
  parseMapShareState,
  replaceMapShareParams,
  type MapViewStateSettler,
} from '@/lib/map-share'

ensureMapWorker()

export default function MapMatriculaPage() {
  const styles = useOverlayStyles()
  const searchParams = useSearchParams()
  const { data, error, loading, retry } = useMapData()
  const shellRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapRef>(null)
  const [initialView] = useState(() => parseMapShareState(searchParams))
  const [basemap, setBasemap] = useState<BasemapId>(initialView.basemap ?? DEFAULT_MAP_BASEMAP)
  const [overlays, setOverlays] =
    useState<Record<OverlayKey, boolean>>(initialView.overlays ?? DEFAULT_MAP_OVERLAYS)
  const stableStateRef = useRef({ basemap, overlays })
  const [selected, setSelected] = useState<SelectedFeature | null>(null)
  const settlerRef = useRef<MapViewStateSettler | null>(null)

  useEffect(() => {
    settlerRef.current = createMapStateSettler((view) => replaceMapShareParams({ ...view, ...stableStateRef.current }))
    const settler = settlerRef.current
    if (!settler) return
    const onPopState = () => {
      // Restore the view from the URL after back/forward navigation.
      settler.cancel()
      const restored = parseMapShareState(new URLSearchParams(window.location.search))
      const restoredBasemap = restored.basemap ?? DEFAULT_MAP_BASEMAP
      const restoredOverlays = restored.overlays ?? DEFAULT_MAP_OVERLAYS
      stableStateRef.current = { basemap: restoredBasemap, overlays: restoredOverlays }
      setBasemap(restoredBasemap)
      setOverlays(restoredOverlays)
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
      settler.cancel()
    }
  }, [])

  const updateStableState = (nextBasemap: BasemapId, nextOverlays: Record<OverlayKey, boolean>) => {
    stableStateRef.current = { basemap: nextBasemap, overlays: nextOverlays }
    const center = mapRef.current?.getCenter()
    replaceMapShareParams({
      longitude: center?.lng,
      latitude: center?.lat,
      zoom: mapRef.current?.getZoom(),
      basemap: nextBasemap,
      overlays: nextOverlays,
    })
  }

  if (loading) {
    return <div className={styles.status}>Cargando mapa…</div>
  }

  if (error || !data) {
    return (
      <div className={`${styles.status} ${styles.statusError}`} role="alert">
        <p>{error ?? 'No hay datos disponibles para este mapa.'}</p>
        <button className="ui-button ui-button--secondary" type="button" onClick={retry}>Reintentar</button>
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
        <BasemapControl value={basemap} onChange={(next) => {
          setBasemap(next)
          updateStableState(next, overlays)
        }} />
        <LayerControl
          overlays={overlays}
          onChange={(key, value) => setOverlays((prev) => {
            const next = { ...prev, [key]: value }
            updateStableState(basemap, next)
            return next
          })}
        />
      </div>

      <FullscreenButton targetRef={shellRef} />
    </div>
  )
}
