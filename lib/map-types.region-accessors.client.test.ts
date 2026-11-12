// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { MAP_CENTER, MAP_ZOOM, mapCenterRegion, mapZoomRegion } from './map-types'
import { cargarRegion, regionPublica, type RegionPublica } from '@/lib/infraestructura/region/index'
import {
  __reiniciarRegionPublicaClienteParaPruebas,
  fijarRegionPublicaCliente,
} from '@/lib/infraestructura/region/publica'

const manaosLike = (): RegionPublica => ({
  ...regionPublica(cargarRegion('corrientes')),
  id: 'manaos',
  nombre: 'Manaos',
  mapaCentro: [-60.02, -3.12],
  mapaZoom: 11,
})

afterEach(() => __reiniciarRegionPublicaClienteParaPruebas())

describe('map center and zoom accessors in the browser', () => {
  it('return the Corrientes center and zoom by default', () => {
    expect(mapCenterRegion()).toEqual([-58.215, -28.811])
    expect(mapZoomRegion()).toBe(8)
  })

  it('read the region set by the provider after this module was imported', () => {
    fijarRegionPublicaCliente(manaosLike())
    expect(mapCenterRegion()).toEqual([-60.02, -3.12])
    expect(mapZoomRegion()).toBe(11)
  })

  it('keep the module-level constants at the Corrientes values', () => {
    fijarRegionPublicaCliente(manaosLike())
    expect(MAP_CENTER).toEqual([-58.215, -28.811])
    expect(MAP_ZOOM).toBe(8)
  })
})
