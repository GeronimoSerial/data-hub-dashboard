'use client'

import { useMemo, type RefObject } from 'react'
import Map, {
  Layer,
  NavigationControl,
  Popup,
  Source,
  type MapLayerMouseEvent,
  type MapRef,
} from 'react-map-gl/maplibre'
import type { CircleLayerSpecification, StyleSpecification } from 'maplibre-gl'
import type { Point } from 'geojson'
import 'maplibre-gl/dist/maplibre-gl.css'
import '@/components/mapas/maplibre-popup.css'
import {
  BASEMAPS,
  MAP_CENTER,
  MAP_ZOOM,
  TREND_COLORS,
  type BasemapId,
  type EstablishmentProperties,
  type OverlayKey,
  type SelectedFeature,
  type ZoneProperties,
} from '@/lib/map-types'
import type { MapData } from '@/lib/use-map-data'
import { normalizeDept } from '@/lib/sobreoferta'
import { ensureMapWorker } from '@/lib/map-worker'
import { FeaturePopup } from '@/components/mapas/feature-popup'
import { useOverlayStyles } from '@/components/mapas/overlay-styles'

ensureMapWorker()

type Props = {
  data: MapData
  basemap: BasemapId
  overlays: Record<OverlayKey, boolean>
  selected: SelectedFeature | null
  onSelect: (feature: SelectedFeature | null) => void
  mapRef: RefObject<MapRef | null>
}

function circlePaint(
  trend: keyof typeof TREND_COLORS,
): CircleLayerSpecification['paint'] {
  const c = TREND_COLORS[trend]
  return {
    'circle-radius': 7,
    'circle-color': c.fill,
    'circle-stroke-color': c.stroke,
    'circle-stroke-width': 1.5,
    'circle-opacity': 0.95,
  }
}

export function MapView({
  data,
  basemap,
  overlays,
  selected,
  onSelect,
  mapRef,
}: Props) {
  const styles = useOverlayStyles()

  const sobreofertaOn = overlays.sobreoferta && data.sobreoferta != null

  const zonesData = useMemo(() => {
    if (!sobreofertaOn || !data.sobreoferta) return data.zones
    return {
      ...data.zones,
      features: data.zones.features.map((f) => {
        const name = f.properties?.name
        const z = name ? data.sobreoferta!.zones[name] : undefined
        if (!z) return f
        return {
          ...f,
          properties: {
            ...f.properties,
            fillColor: z.fillColor,
            strokeColor: z.strokeColor,
          },
        }
      }),
    }
  }, [data.zones, data.sobreoferta, sobreofertaOn])

  const establishmentsData = useMemo(() => {
    if (!sobreofertaOn || !data.sobreoferta) return data.establishments
    return {
      ...data.establishments,
      features: data.establishments.features.map((f) => {
        const key = normalizeDept(f.properties?.department)
        const d = data.sobreoferta!.departments[key]
        if (!d) return f
        return {
          ...f,
          properties: {
            ...f.properties,
            fillColor: d.fillColor,
            strokeColor: d.strokeColor,
          },
        }
      }),
    }
  }, [data.establishments, data.sobreoferta, sobreofertaOn])

  function schoolCirclePaint(
    trend: keyof typeof TREND_COLORS,
  ): CircleLayerSpecification['paint'] {
    const c = TREND_COLORS[trend]
    if (!sobreofertaOn) return circlePaint(trend)
    return {
      'circle-radius': 7,
      'circle-color': ['coalesce', ['get', 'fillColor'], c.fill],
      'circle-stroke-color': ['coalesce', ['get', 'strokeColor'], c.stroke],
      'circle-stroke-width': 1.5,
      'circle-opacity': 0.95,
    }
  }

  const mapStyle = useMemo<StyleSpecification>(() => {
    const bm = BASEMAPS[basemap]
    return {
      version: 8,
      glyphs:
        'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',
      sources: {
        basemap: {
          type: 'raster',
          tiles: bm.tiles,
          tileSize: 256,
          attribution: bm.attribution,
        },
      },
      layers: [
        {
          id: 'basemap',
          type: 'raster',
          source: 'basemap',
        },
      ],
    }
  }, [basemap])

  const handleClick = (event: MapLayerMouseEvent) => {
    const features = event.features ?? []
    if (features.length === 0) {
      onSelect(null)
      return
    }

    const establishment = features.find((f) => f.layer.id.startsWith('est-'))
    if (establishment && establishment.properties) {
      const parsed = parseEstablishmentProps(establishment.properties)
      const coords = (establishment.geometry as Point).coordinates as [
        number,
        number,
      ]
      onSelect({
        kind: 'establishment',
        coordinates: coords,
        properties: parsed,
      })
      return
    }

    const zone = features.find(
      (f) => f.layer.id === 'zones-fill' || f.layer.id === 'zones-outline',
    )
    if (zone && zone.properties) {
      const parsed = parseZoneProps(zone.properties)
      const center =
        parsed.center ??
        ([event.lngLat.lng, event.lngLat.lat] as [number, number])
      onSelect({
        kind: 'zone',
        coordinates: center,
        properties: parsed,
      })
      return
    }

    onSelect(null)
  }

  return (
    <div className={styles.mapRoot}>
      <Map
        ref={mapRef}
        mapStyle={mapStyle}
        initialViewState={{
          longitude: MAP_CENTER[0],
          latitude: MAP_CENTER[1],
          zoom: MAP_ZOOM,
        }}
        style={{ width: '100%', height: '100%' }}
        interactiveLayerIds={[
          ...(overlays.down ? (['est-down'] as const) : []),
          ...(overlays.up ? (['est-up'] as const) : []),
          ...(overlays.flat ? (['est-flat'] as const) : []),
          ...(overlays.partial ? (['est-partial'] as const) : []),
          ...(overlays.zones ? (['zones-fill'] as const) : []),
        ]}
        onClick={handleClick}
        cursor="pointer"
      >
        <NavigationControl position="top-left" />

        {overlays.zones && (
          <Source id="zones-fill-src" type="geojson" data={zonesData}>
            <Layer
              id="zones-fill"
              type="fill"
              paint={{
                'fill-color': ['coalesce', ['get', 'fillColor'], '#F4B7B4'],
                'fill-opacity': 0.22,
              }}
            />
          </Source>
        )}

        <Source id="establishments" type="geojson" data={establishmentsData}>
          {overlays.down && (
            <Layer
              id="est-down"
              type="circle"
              filter={['==', ['get', 'trend'], 'down']}
              paint={schoolCirclePaint('down')}
            />
          )}
          {overlays.up && (
            <Layer
              id="est-up"
              type="circle"
              filter={['==', ['get', 'trend'], 'up']}
              paint={schoolCirclePaint('up')}
            />
          )}
          {overlays.flat && (
            <Layer
              id="est-flat"
              type="circle"
              filter={['==', ['get', 'trend'], 'flat']}
              paint={schoolCirclePaint('flat')}
            />
          )}
          {overlays.partial && (
            <Layer
              id="est-partial"
              type="circle"
              filter={['==', ['get', 'trend'], 'partial']}
              paint={schoolCirclePaint('partial')}
            />
          )}
        </Source>

        {overlays.zones && (
          <Source id="zones" type="geojson" data={zonesData}>
            <Layer
              id="zones-outline"
              type="line"
              paint={{
                'line-color': ['coalesce', ['get', 'strokeColor'], '#D64541'],
                'line-width': 2.5,
              }}
            />
            <Layer
              id="zones-label"
              type="symbol"
              layout={{
                'text-field': ['get', 'name'],
                'text-size': 11,
                'text-font': ['Noto Sans Regular'],
                'text-anchor': 'center',
              }}
              paint={{
                'text-color': '#222222',
                'text-halo-color': '#ffffff',
                'text-halo-width': 1.5,
              }}
            />
          </Source>
        )}

        {overlays.localities && (
          <Source id="localities" type="geojson" data={data.localities}>
            <Layer
              id="localities-label"
              type="symbol"
              layout={{
                'text-field': ['get', 'name'],
                'text-size': 10,
                'text-font': ['Noto Sans Regular'],
                'text-anchor': 'center',
                'text-offset': [0, 0],
              }}
              paint={{
                'text-color': '#222222',
                'text-halo-color': 'rgba(255,255,255,0.9)',
                'text-halo-width': 1.2,
              }}
            />
          </Source>
        )}

        {selected && (
          <Popup
            longitude={selected.coordinates[0]}
            latitude={selected.coordinates[1]}
            anchor="bottom"
            onClose={() => onSelect(null)}
            closeOnClick={false}
            maxWidth="390px"
          >
            <FeaturePopup
              feature={selected}
              api={data.apiEnrollment}
              sobreoferta={data.sobreoferta}
              sobreofertaOn={Boolean(overlays.sobreoferta)}
            />
          </Popup>
        )}
      </Map>
    </div>
  )
}

function parseEstablishmentProps(
  raw: Record<string, unknown>,
): EstablishmentProperties {
  const enrollment =
    typeof raw.enrollment === 'string'
      ? (JSON.parse(raw.enrollment) as EstablishmentProperties['enrollment'])
      : (raw.enrollment as EstablishmentProperties['enrollment'])

  return {
    cue: (raw.cue as string) ?? null,
    name: (raw.name as string) ?? null,
    locality: (raw.locality as string) ?? null,
    department: (raw.department as string) ?? null,
    zone: (raw.zone as string) ?? null,
    enrollment,
    absChange: toNum(raw.absChange),
    pctChange: toNum(raw.pctChange),
    trendLabel: (raw.trendLabel as string) ?? null,
    monthlySalaryCost: toNum(raw.monthlySalaryCost),
    trend: raw.trend as EstablishmentProperties['trend'],
    fillColor: (raw.fillColor as string) ?? null,
  }
}

function parseZoneProps(raw: Record<string, unknown>): ZoneProperties {
  const observable =
    typeof raw.observable === 'string'
      ? JSON.parse(raw.observable)
      : raw.observable
  const comparable =
    typeof raw.comparable === 'string'
      ? JSON.parse(raw.comparable)
      : raw.comparable
  const center =
    typeof raw.center === 'string' ? JSON.parse(raw.center) : raw.center

  return {
    name: String(raw.name ?? 'Zona'),
    diameterKm: toNum(raw.diameterKm),
    establishments: toNum(raw.establishments),
    completeHistory: toNum(raw.completeHistory),
    observable: observable as ZoneProperties['observable'],
    comparable: comparable as ZoneProperties['comparable'],
    pctChange: toNum(raw.pctChange),
    trendLabel: (raw.trendLabel as string) ?? null,
    upCount: toNum(raw.upCount),
    downCount: toNum(raw.downCount),
    flatCount: toNum(raw.flatCount),
    monthlySalaryCost: toNum(raw.monthlySalaryCost),
    monthlySavings: toNum(raw.monthlySavings),
    trend: raw.trend as ZoneProperties['trend'],
    center: center as [number, number],
    radiusM: toNum(raw.radiusM) ?? 10000,
    fillColor: (raw.fillColor as string) ?? null,
    strokeColor: (raw.strokeColor as string) ?? null,
  }
}

function toNum(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}
