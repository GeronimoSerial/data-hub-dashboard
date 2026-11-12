// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import {
  DEPARTAMENTOS_URL,
  LIMITES_CORRIENTES,
  LIMITES_CORRIENTES_BBOX,
  MASCARA_URL,
  limitesRegion,
  limitesRegionBbox,
  urlDepartamentos,
  urlMascara,
} from './departamentos'
import { cargarRegion, regionPublica, type RegionPublica } from '@/lib/infraestructura/region/index'
import {
  __reiniciarRegionPublicaClienteParaPruebas,
  fijarRegionPublicaCliente,
} from '@/lib/infraestructura/region/publica'

const CORRIENTES_LIMITES = [
  [-59.710824, -30.730192],
  [-55.620259, -27.253966],
]

const manaosLike = (): RegionPublica => ({
  ...regionPublica(cargarRegion('corrientes')),
  id: 'manaos',
  nombre: 'Manaos',
  limitesMapa: [
    [-60.45, -3.45],
    [-59.6, -2.6],
  ],
  mapaCentro: [-60.02, -3.12],
  archivos: {
    mascara: '/data/mascara-manaos.geojson',
    departamentos: '/data/departamentos-manaos.geojson',
  },
})

afterEach(() => __reiniciarRegionPublicaClienteParaPruebas())

describe('region-aware accessors in the browser', () => {
  it('return the Corrientes values by default', () => {
    expect(limitesRegion()).toEqual(CORRIENTES_LIMITES)
    expect(limitesRegionBbox()).toEqual([-59.710824, -30.730192, -55.620259, -27.253966])
    expect(urlMascara()).toBe('/data/mascara-corrientes.geojson')
    expect(urlDepartamentos()).toBe('/data/departamentos-corrientes-georef-2026-09-27.geojson')
  })

  it('read the region set by the provider after this module was imported', () => {
    fijarRegionPublicaCliente(manaosLike())
    expect(limitesRegion()).toEqual([
      [-60.45, -3.45],
      [-59.6, -2.6],
    ])
    expect(limitesRegionBbox()).toEqual([-60.45, -3.45, -59.6, -2.6])
    expect(urlMascara()).toBe('/data/mascara-manaos.geojson')
    expect(urlDepartamentos()).toBe('/data/departamentos-manaos.geojson')
  })

  it('keep the module-level Corrientes-only constants unchanged after the region is set', () => {
    fijarRegionPublicaCliente(manaosLike())
    expect(LIMITES_CORRIENTES).toEqual(CORRIENTES_LIMITES)
    expect(LIMITES_CORRIENTES_BBOX).toEqual([-59.710824, -30.730192, -55.620259, -27.253966])
    expect(MASCARA_URL).toBe('/data/mascara-corrientes.geojson')
    expect(DEPARTAMENTOS_URL).toBe('/data/departamentos-corrientes-georef-2026-09-27.geojson')
  })
})
