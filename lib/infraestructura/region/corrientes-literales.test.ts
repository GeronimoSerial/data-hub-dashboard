import { describe, expect, it } from 'vitest'
import { cargarRegion, regionPublica } from './index'
import { regionPublicaActual } from './publica'

// Characterization: the values Corrientes produced before the region was configurable.
describe('corrientes public region literals', () => {
  const publica = regionPublica(cargarRegion('corrientes'))

  it('regionesInteresLluvia matches the rain layer literals', () => {
    expect(publica.regionesInteresLluvia).toEqual([
      { lon: [-59.8, -55.6], lat: [-30.8, -27.2] },
      { lon: [-56.1, -53.6], lat: [-28.2, -25.4] },
    ])
  })

  it('mapaCentro and mapaZoom match the map-types literals', () => {
    expect(publica.mapaCentro).toEqual([-58.215, -28.811])
    expect(publica.mapaZoom).toBe(8)
  })

  it('vistaInicial matches the radar flyTo literals', () => {
    expect(publica.vistaInicial).toEqual({ centro: [-58.15, -29.55], zoom: 6.3 })
  })

  it('regionPublicaActual on the server exposes the same literals', () => {
    const actual = regionPublicaActual()
    expect(actual.regionesInteresLluvia).toEqual(publica.regionesInteresLluvia)
    expect(actual.mapaCentro).toEqual([-58.215, -28.811])
    expect(actual.mapaZoom).toBe(8)
    expect(actual.vistaInicial).toEqual({ centro: [-58.15, -29.55], zoom: 6.3 })
  })
})
