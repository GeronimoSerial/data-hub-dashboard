import type { FeatureCollection, Geometry } from 'geojson'

export type Trend = 'up' | 'down' | 'flat' | 'partial'

export type EnrollmentSeries = {
  2023: number | null
  2024: number | null
  2025: number | null
  2026: number | null
}

export type EstablishmentProperties = {
  cue: string | null
  name: string | null
  locality: string | null
  department: string | null
  zone: string | null
  enrollment: EnrollmentSeries
  absChange: number | null
  pctChange: number | null
  trendLabel: string | null
  monthlySalaryCost: number | null
  trend: Trend
  fillColor: string | null
}

export type ZoneProperties = {
  name: string
  diameterKm: number | null
  establishments: number | null
  completeHistory: number | null
  observable: EnrollmentSeries
  comparable: { 2023: number | null; 2026: number | null }
  pctChange: number | null
  trendLabel: string | null
  upCount: number | null
  downCount: number | null
  flatCount: number | null
  monthlySalaryCost: number | null
  monthlySavings: number | null
  trend: Trend
  center: [number, number]
  radiusM: number
  fillColor: string | null
  strokeColor: string | null
}

export type LocalityProperties = {
  name: string | null
}

export type Summary = {
  comparableEstablishments: number
  enrollment2023: number
  enrollment2026: number
  pctChange: number | null
  title: string
  description: string
}

export type GeoJsonFeatureCollection<G extends Geometry = Geometry, P = null> =
  FeatureCollection<G, P>

export type ApiOfferStats = {
  inicio: number
  fin: number
}

export type ApiTurnStats = ApiOfferStats

export type ApiYearStats = {
  inicio: number
  fin: number | null
  sobreedad: number
  repitencia: number | null
}

export type ApiEnrollment = {
  years: Record<string, ApiYearStats>
  errors: Record<string, string>
  byOffer: Record<string, ApiOfferStats>
  byTurn: Record<string, ApiTurnStats>
  ofertas: string[]
}

export type ApiYearMeta = {
  ok: number
  failed: number
  pending: number
  totalInicio: number
  totalFin: number
  withFin: number
}

export type ApiEnrollmentData = {
  ciclos: number[]
  generatedAt: string
  meta: {
    byYear: Record<string, ApiYearMeta>
  }
  byCue: Record<string, ApiEnrollment>
}

export type SelectedFeature =
  | {
      kind: 'establishment'
      coordinates: [number, number]
      properties: EstablishmentProperties
    }
  | {
      kind: 'zone'
      coordinates: [number, number]
      properties: ZoneProperties
    }

export type OverlayKey =
  | 'zones'
  | 'sobreoferta'
  | 'down'
  | 'up'
  | 'flat'
  | 'partial'
  | 'localities'

export type { SobreofertaData, Semaforo } from '@/lib/sobreoferta'

export type BasemapId = 'osm' | 'voyager' | 'positron'

export const TREND_COLORS: Record<
  Trend,
  { fill: string; stroke: string; label: string }
> = {
  up: { fill: '#B7E1B0', stroke: '#3A8D3A', label: 'Aumentó' },
  down: { fill: '#F4B7B4', stroke: '#D64541', label: 'Disminuyó' },
  flat: { fill: '#FFF0A8', stroke: '#D8A900', label: 'Sin cambio' },
  partial: { fill: '#D9D9D9', stroke: '#777777', label: 'Historia parcial' },
}

export const OVERLAY_LABELS: Record<OverlayKey, string> = {
  zones: 'Zonas 20 km - evolución',
  sobreoferta: 'Sobreoferta escolar',
  down: 'Establecimientos con disminución',
  up: 'Establecimientos con aumento',
  flat: 'Establecimientos sin cambio',
  partial: 'Historia parcial',
  localities: 'Localidades',
}

export const BASEMAPS: Record<
  BasemapId,
  { label: string; tiles: string[]; attribution: string; tileSize?: number }
> = {
  osm: {
    label: 'Rutas y caminos',
    tiles: [
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    ],
    attribution:
      'Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, NRCAN, Esri Japan, METI, Esri China (Hong Kong), Esri (Thailand), TomTom',
  },
  voyager: {
    label: 'Mapa vial alternativo',
    tiles: [
      'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
      'https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
      'https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
      'https://d.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
    ],
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
  positron: {
    label: 'Mapa claro',
    tiles: [
      'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
      'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
      'https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
      'https://d.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
    ],
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
}

export const MAP_CENTER: [number, number] = [-58.215, -28.811]
export const MAP_ZOOM = 8
