// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearMapDataCache, useMapData } from './use-map-data'

const required = {
  '/data/summary.json': { title: 'Mapa' },
  '/data/establishments.geojson': { type: 'FeatureCollection', features: [] },
  '/data/zones.geojson': { type: 'FeatureCollection', features: [] },
  '/data/localities.geojson': { type: 'FeatureCollection', features: [] },
  '/data/api-cantidad-alumnos.json': {},
  '/data/sobreoferta.json': {},
} as const

beforeEach(() => {
  clearMapDataCache()
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
    ok: true,
    json: async () => required[url as keyof typeof required],
  })))
})

afterEach(() => vi.unstubAllGlobals())

describe('useMapData', () => {
  it('reuses the resolved dataset when the map remounts', async () => {
    const first = renderHook(() => useMapData())
    await waitFor(() => expect(first.result.current.loading).toBe(false))
    expect(fetch).toHaveBeenCalledTimes(6)
    first.unmount()

    const second = renderHook(() => useMapData())
    await waitFor(() => expect(second.result.current.loading).toBe(false))
    expect(fetch).toHaveBeenCalledTimes(6)
  })

  it('clears a failed request and retries safely', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false } as Response)
    const hook = renderHook(() => useMapData())
    await waitFor(() => expect(hook.result.current.error).not.toBeNull())
    act(() => hook.result.current.retry())
    await waitFor(() => expect(hook.result.current.data).not.toBeNull())
    expect(hook.result.current.error).toBeNull()
  })
})
