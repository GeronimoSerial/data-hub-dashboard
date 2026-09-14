import { describe, expect, it, vi, afterEach } from 'vitest'
import {
  createMapStateSettler,
  DEFAULT_MAP_OVERLAYS,
  parseMapShareState,
  parseMapViewState,
  serializeMapViewState,
} from './map-share'

afterEach(() => vi.useRealTimers())

describe('map share state', () => {
  it('clamps valid values and ignores malformed input', () => {
    expect(parseMapViewState('lng=200&lat=-90&zoom=30&foo=bar')).toEqual({ longitude: 180, latitude: -85, zoom: 24 })
    expect(parseMapViewState('lng=nope&zoom=')).toEqual({})
  })

  it('restores supported basemap and overlays and ignores unknown values', () => {
    expect(parseMapShareState('base=positron&layers=zones,up,nope')).toEqual({
      basemap: 'positron',
      overlays: { ...DEFAULT_MAP_OVERLAYS, sobreoferta: false, down: false, flat: false, partial: false, localities: false },
    })
    expect(parseMapShareState('base=unknown')).toEqual({})
  })

  it('serializes a stable compact URL state', () => {
    expect(serializeMapViewState({ longitude: -58.123456, latitude: -27.451, zoom: 10.2 }).toString()).toBe('lng=-58.12346&lat=-27.45100&zoom=10.20')
  })

  it('round-trips parsed view state through serialization', () => {
    const parsed = parseMapViewState('lng=-58.12346&lat=-27.45100&zoom=10.20')
    expect(serializeMapViewState(parsed).toString()).toBe('lng=-58.12346&lat=-27.45100&zoom=10.20')
  })
})

describe('map state settler', () => {
  it('settles rapid movement into a single trailing update', () => {
    vi.useFakeTimers()
    const apply = vi.fn()
    const settler = createMapStateSettler(apply, 400)

    settler.schedule({ longitude: 1, latitude: 2, zoom: 3 })
    settler.schedule({ longitude: 4, latitude: 5, zoom: 6 })
    settler.schedule({ longitude: 7, latitude: 8, zoom: 9 })
    vi.advanceTimersByTime(399)
    expect(apply).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(apply).toHaveBeenCalledTimes(1)
    expect(apply).toHaveBeenCalledWith({ longitude: 7, latitude: 8, zoom: 9 })
  })

  it('flushes pending state immediately and cancels silently', () => {
    vi.useFakeTimers()
    const apply = vi.fn()
    const settler = createMapStateSettler(apply, 400)

    settler.schedule({ longitude: 1, latitude: 2, zoom: 3 })
    settler.flush()
    expect(apply).toHaveBeenCalledTimes(1)

    settler.schedule({ longitude: 4, latitude: 5, zoom: 6 })
    settler.cancel()
    vi.advanceTimersByTime(500)
    expect(apply).toHaveBeenCalledTimes(1)
  })

  it('does not double-apply after flush', () => {
    vi.useFakeTimers()
    const apply = vi.fn()
    const settler = createMapStateSettler(apply, 400)
    settler.schedule({ longitude: 1, latitude: 2, zoom: 3 })
    settler.flush()
    vi.advanceTimersByTime(500)
    expect(apply).toHaveBeenCalledTimes(1)
  })
})
