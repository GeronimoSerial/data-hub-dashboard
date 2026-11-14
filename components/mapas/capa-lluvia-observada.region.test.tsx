// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { pintarGrillaLluvia } from './capa-lluvia-observada'
import { cargarRegion, regionPublica, type RegionPublica } from '@/lib/infraestructura/region/index'
import {
  __reiniciarRegionPublicaClienteParaPruebas,
  fijarRegionPublicaCliente,
} from '@/lib/infraestructura/region/publica'

// Alpha channel of the single cell at the given geometryRef, read from the RGBA buffer.
function alfaDeCelda(geometryRef: string) {
  const grilla = pintarGrillaLluvia([{ geometryRef, acumuladoMm: 20 }])
  return grilla.datos[3]
}

const manaosLike = (): RegionPublica => ({
  ...regionPublica(cargarRegion('corrientes')),
  id: 'manaos',
  nombre: 'Manaos',
  regionesInteresLluvia: [{ lon: [-60.45, -59.6], lat: [-3.45, -2.6] }],
})

afterEach(() => __reiniciarRegionPublicaClienteParaPruebas())

describe('lluvia observada region of interest in the browser', () => {
  it('fades cells outside the Corrientes regions of interest by default', () => {
    expect(alfaDeCelda('-3.1_-60.0')).toBe(0)
    expect(alfaDeCelda('-28.5_-57.0')).toBeGreaterThan(0)
  })

  it('uses the region set by the provider after this module was imported', () => {
    fijarRegionPublicaCliente(manaosLike())
    expect(alfaDeCelda('-3.1_-60.0')).toBeGreaterThan(0)
    expect(alfaDeCelda('-28.5_-57.0')).toBe(0)
  })
})
