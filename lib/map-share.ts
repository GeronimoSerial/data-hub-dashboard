import type { BasemapId, OverlayKey } from '@/lib/map-types'

export type MapViewState = { longitude: number; latitude: number; zoom: number }
export type MapShareState = MapViewState & {
  basemap: BasemapId
  overlays: Record<OverlayKey, boolean>
}

export const DEFAULT_MAP_BASEMAP: BasemapId = 'voyager'
export const DEFAULT_MAP_OVERLAYS: Record<OverlayKey, boolean> = {
  zones: true,
  sobreoferta: false,
  down: true,
  up: true,
  flat: true,
  partial: true,
  localities: true,
}

const BASEMAPS = new Set<BasemapId>(['osm', 'voyager', 'positron'])
const OVERLAYS: OverlayKey[] = ['zones', 'sobreoferta', 'down', 'up', 'flat', 'partial', 'localities']

const bounds = {
  longitude: [-180, 180] as const,
  latitude: [-85, 85] as const,
  zoom: [0, 24] as const,
}

function finite(value: string | null) {
  if (value == null || value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function clamp(value: number, range: readonly [number, number]) {
  return Math.min(range[1], Math.max(range[0], value))
}

export function parseMapViewState(params: URLSearchParams | string): Partial<MapViewState> {
  const search = typeof params === 'string' ? new URLSearchParams(params) : params
  const longitude = finite(search.get('lng'))
  const latitude = finite(search.get('lat'))
  const zoom = finite(search.get('zoom'))
  return {
    ...(longitude == null ? {} : { longitude: clamp(longitude, bounds.longitude) }),
    ...(latitude == null ? {} : { latitude: clamp(latitude, bounds.latitude) }),
    ...(zoom == null ? {} : { zoom: clamp(zoom, bounds.zoom) }),
  }
}

export function mapViewParamsFor(state: Partial<MapViewState>) {
  const params = new URLSearchParams()
  if (state.longitude != null && Number.isFinite(state.longitude)) params.set('lng', clamp(state.longitude, bounds.longitude).toFixed(5))
  if (state.latitude != null && Number.isFinite(state.latitude)) params.set('lat', clamp(state.latitude, bounds.latitude).toFixed(5))
  if (state.zoom != null && Number.isFinite(state.zoom)) params.set('zoom', clamp(state.zoom, bounds.zoom).toFixed(2))
  return params
}

export function serializeMapViewState(state: Partial<MapViewState>) {
  return mapViewParamsFor(state)
}

export function parseMapShareState(params: URLSearchParams | string): Partial<MapShareState> {
  const search = typeof params === 'string' ? new URLSearchParams(params) : params
  const basemap = search.get('base')
  const layerParam = search.get('layers')
  const enabled = layerParam == null ? null : new Set(layerParam.split(',').filter((key): key is OverlayKey => OVERLAYS.includes(key as OverlayKey)))
  return {
    ...parseMapViewState(search),
    ...(basemap && BASEMAPS.has(basemap as BasemapId) ? { basemap: basemap as BasemapId } : {}),
    ...(enabled == null ? {} : {
      overlays: Object.fromEntries(OVERLAYS.map((key) => [key, enabled.has(key)])) as Record<OverlayKey, boolean>,
    }),
  }
}

export function mapShareParamsFor(state: Partial<MapShareState>) {
  const params = mapViewParamsFor(state)
  if (state.basemap && BASEMAPS.has(state.basemap)) params.set('base', state.basemap)
  if (state.overlays) {
    params.set('layers', OVERLAYS.filter((key) => state.overlays?.[key]).join(','))
  }
  return params
}

/**
 * Settles rapid map movement into a single trailing URL update so the history
 * entry is not replaced on every pan/zoom event. `schedule` stores the latest
 * state and debounces; `flush` applies immediately (used on unmount/cleanup).
 */
export type MapViewStateSettler = {
  schedule: (state: MapViewState) => void
  flush: () => void
  cancel: () => void
}

export function createMapStateSettler(
  apply: (state: MapViewState) => void,
  delay = 400,
): MapViewStateSettler {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: MapViewState | null = null

  const run = () => {
    timer = null
    if (pending) {
      const state = pending
      pending = null
      apply(state)
    }
  }

  return {
    schedule(state) {
      pending = state
      if (timer == null) timer = setTimeout(run, delay)
    },
    flush() {
      if (timer != null) {
        clearTimeout(timer)
        timer = null
      }
      run()
    },
    cancel() {
      if (timer != null) {
        clearTimeout(timer)
        timer = null
      }
      pending = null
    },
  }
}

export function replaceMapViewParams(state: Partial<MapViewState>) {
  replaceMapShareParams(state)
}

export function replaceMapShareParams(state: Partial<MapShareState>) {
  const url = new URL(window.location.href)
  const next = mapShareParamsFor(state)
  for (const key of ['lng', 'lat', 'zoom', 'base', 'layers']) {
    // `layers=` (empty) is meaningful: it encodes "all overlays off". Only a
    // missing param should delete the key, so treat empty string as present.
    const value = next.get(key)
    if (value != null) url.searchParams.set(key, value)
    else url.searchParams.delete(key)
  }
  // Only replace history when the search actually differs, avoiding duplicate
  // entries after resettling over the same view.
  if (url.search !== new URL(window.location.href).search) {
    window.history.replaceState(window.history.state, '', url)
  }
}
