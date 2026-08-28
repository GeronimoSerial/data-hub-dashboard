export type MapViewState = { longitude: number; latitude: number; zoom: number }

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
  const url = new URL(window.location.href)
  const next = mapViewParamsFor(state)
  for (const key of ['lng', 'lat', 'zoom']) {
    const value = next.get(key)
    if (value) url.searchParams.set(key, value)
    else url.searchParams.delete(key)
  }
  // Only replace history when the search actually differs, avoiding duplicate
  // entries after resettling over the same view.
  if (url.search !== new URL(window.location.href).search) {
    window.history.replaceState(window.history.state, '', url)
  }
}