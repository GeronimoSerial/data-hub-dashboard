// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_MAP_OVERLAYS,
  mapShareParamsFor,
  parseMapShareState,
  replaceMapShareParams,
} from './map-share'
import type { OverlayKey } from '@/lib/map-types'

afterEach(() => vi.restoreAllMocks())

function allOff(): Record<OverlayKey, boolean> {
  return Object.fromEntries(
    Object.keys(DEFAULT_MAP_OVERLAYS).map((key) => [key, false]),
  ) as Record<OverlayKey, boolean>
}

describe('map share URL replacement', () => {
  it('serializes an all-off overlay state as an explicit empty layers param', () => {
    const params = mapShareParamsFor({ overlays: allOff() })
    expect(params.get('layers')).toBe('')
    expect(params.toString()).toBe('layers=')
  })

  it('replaces the URL keeping an empty layers= instead of deleting it', () => {
    window.history.replaceState(window.history.state, '', '/mapas/matricula')
    replaceMapShareParams({ overlays: allOff() })
    expect(window.location.search).toContain('layers=')
    expect(window.location.search).not.toContain('layers=&')
  })

  it('round-trips an all-off overlay state through parse', () => {
    expect(parseMapShareState('layers=').overlays).toEqual(allOff())
  })

  it('omits layers when no overlay state is provided', () => {
    window.history.replaceState(window.history.state, '', '/mapas/matricula')
    replaceMapShareParams({ longitude: 1, latitude: 2, zoom: 3 })
    expect(window.location.search).not.toContain('layers')
  })
})