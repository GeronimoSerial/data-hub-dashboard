// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { etiquetaDestino } from './shared'
import { __reiniciarRegionPublicaClienteParaPruebas, fijarRegionPublicaCliente } from '@/lib/infraestructura/region/publica'
import { regionPublica } from '@/lib/infraestructura/region/esquema'
import { cargarRegion } from '@/lib/infraestructura/region/registro'

afterEach(() => __reiniciarRegionPublicaClienteParaPruebas())

describe('etiquetaDestino', () => {
  it('Corrientes keeps the existing label', () => {
    expect(etiquetaDestino('/mapas/infraestructura')).toBe('ENOS Corrientes')
  })

  it('uses the region name for the infrastructure map', () => {
    fijarRegionPublicaCliente(regionPublica(cargarRegion('manaos')))
    expect(etiquetaDestino('/mapas/infraestructura')).toBe('ENOS Manaos')
  })

  it('leaves other destinations untouched and returns undefined for unknown ones', () => {
    fijarRegionPublicaCliente(regionPublica(cargarRegion('manaos')))
    expect(etiquetaDestino('/situacion')).toBe('Situación')
    expect(etiquetaDestino('/otra')).toBeUndefined()
  })
})
