import { describe, expect, it, vi } from 'vitest'
import { COLOR_AGUA_LINEA, COLOR_TIERRA, ajustesCapa, jerarquiaRuta, realzarRutasYAgua } from './basemap-rutas-agua'

const ruta = (id: string, filter: unknown) => ({ id, type: 'line', 'source-layer': 'transportation', filter })
const noTunel = ['match', ['get', 'brunnel'], ['bridge', 'tunnel'], false, true]

describe('jerarquiaRuta', () => {
  it('classifies OpenMapTiles road layers by the classes in their filter, not by id', () => {
    expect(jerarquiaRuta(ruta('x1', ['all', noTunel, ['match', ['get', 'class'], ['primary', 'trunk'], true, false]]))).toBe('principal')
    expect(jerarquiaRuta(ruta('x2', ['all', noTunel, ['match', ['get', 'class'], ['secondary', 'tertiary'], true, false]]))).toBe('principal')
    expect(jerarquiaRuta(ruta('x3', ['all', noTunel, ['match', ['get', 'class'], ['service', 'track'], true, false]]))).toBe('tierra')
    expect(jerarquiaRuta(ruta('x4', ['all', ['match', ['get', 'class'], ['minor'], true, false]]))).toBe('menor')
  })

  it('leaves ramp layers, rail and non-transportation layers alone', () => {
    expect(jerarquiaRuta(ruta('l', ['all', ['==', ['get', 'ramp'], 1], ['match', ['get', 'class'], ['motorway', 'track'], true, false]]))).toBeNull()
    expect(jerarquiaRuta(ruta('r', ['==', ['get', 'class'], 'rail']))).toBeNull()
    expect(jerarquiaRuta({ id: 'w', type: 'line', 'source-layer': 'waterway', filter: ['==', 'class', 'primary'] })).toBeNull()
  })
})

describe('ajustesCapa', () => {
  it('draws track and unclassified in the dirt tone and quiets service in the same layer', () => {
    const ajustes = ajustesCapa(ruta('road_service_track', ['match', ['get', 'class'], ['service', 'track'], true, false]))
    const color = ajustes.find(([, p]) => p === 'line-color')?.[2]
    expect(color).toEqual(['match', ['get', 'class'], ['track', 'unclassified'], COLOR_TIERRA, expect.any(String)])
  })

  it('dashes intermittent waterways and keeps permanent ones solid', () => {
    const ajustes = ajustesCapa({ id: 'waterway-river', type: 'line', 'source-layer': 'waterway' })
    expect(ajustes).toContainEqual(['paint', 'line-color', COLOR_AGUA_LINEA])
    expect(ajustes).toContainEqual([
      'paint',
      'line-dasharray',
      ['case', ['==', ['get', 'intermittent'], 1], ['literal', [3, 2]], ['literal', [1, 0]]],
    ])
  })

  it('italicises waterway labels', () => {
    expect(ajustesCapa({ id: 'waterway_line_label', type: 'symbol', 'source-layer': 'waterway' })).toEqual([
      ['layout', 'text-font', ['literal', ['Noto Sans Italic']]],
    ])
  })
})

describe('realzarRutasYAgua', () => {
  it('applies every adjustment and survives a layer that rejects a property', () => {
    const setPaintProperty = vi.fn((id: string) => {
      if (id === 'roto') throw new Error('no')
    })
    const setLayoutProperty = vi.fn()
    realzarRutasYAgua({ setPaintProperty, setLayoutProperty }, [
      { id: 'roto', type: 'line', 'source-layer': 'waterway' },
      ruta('road_trunk_primary', ['match', ['get', 'class'], ['primary', 'trunk'], true, false]),
    ])
    expect(setPaintProperty).toHaveBeenCalledWith('road_trunk_primary', 'line-opacity', 1)
  })
})
