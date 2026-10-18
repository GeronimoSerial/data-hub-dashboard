import { describe, expect, it, vi } from 'vitest'
import { aquietarBasemap } from './basemap-sereno'

describe('aquietarBasemap', () => {
  it('hides POIs and shields and drops place-dot icons from town labels', () => {
    const setLayoutProperty = vi.fn()
    const setPaintProperty = vi.fn()
    aquietarBasemap({
      getStyle: () => ({
        layers: [
          { id: 'poi_r20', type: 'symbol' },
          { id: 'highway-shield-non-us', type: 'symbol' },
          { id: 'label_town', type: 'symbol', layout: { 'icon-image': 'circle_11_black' } },
          { id: 'water', type: 'fill' },
        ],
      }),
      setLayoutProperty,
      setPaintProperty,
    })
    expect(setLayoutProperty).toHaveBeenCalledWith('poi_r20', 'visibility', 'none')
    expect(setLayoutProperty).toHaveBeenCalledWith('highway-shield-non-us', 'visibility', 'none')
    expect(setLayoutProperty).toHaveBeenCalledWith('label_town', 'icon-image', undefined)
    expect(setPaintProperty).toHaveBeenCalledWith('label_town', 'text-opacity', 0.7)
    expect(setLayoutProperty.mock.calls.some(([id]) => id === 'water')).toBe(false)
  })
})
