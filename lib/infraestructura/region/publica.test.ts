import { afterEach, beforeEach, describe, it, expect } from 'vitest'
import { regionPublicaActual, __reiniciarRegionPublicaClienteParaPruebas, fijarRegionPublicaCliente } from './publica'
import { cargarRegion, regionPublica } from './index'
import { __reiniciarRegionActivaParaPruebas } from './activa'

const originalRegion = process.env.REGION

describe('regionPublicaActual on the server (node env)', () => {
  beforeEach(() => {
    delete process.env.REGION
    __reiniciarRegionActivaParaPruebas()
    __reiniciarRegionPublicaClienteParaPruebas()
  })
  afterEach(() => {
    if (originalRegion === undefined) delete process.env.REGION
    else process.env.REGION = originalRegion
    __reiniciarRegionActivaParaPruebas()
    __reiniciarRegionPublicaClienteParaPruebas()
  })

  it('returns corrientes when REGION is unset', () => {
    const r = regionPublicaActual()
    expect(r.id).toBe('corrientes')
    expect(r.zonaHoraria).toBe('America/Argentina/Buenos_Aires')
    expect(r.locale).toBe('es-AR')
  })

  it('equals regionPublica(regionActiva()) data', () => {
    expect(regionPublicaActual()).toEqual(regionPublica(cargarRegion('corrientes')))
  })

  it('ignores a value stored by fijarRegionPublicaCliente', () => {
    fijarRegionPublicaCliente({ ...regionPublicaActual(), id: 'otra', zonaHoraria: 'America/Manaus' })
    expect(regionPublicaActual().zonaHoraria).toBe('America/Argentina/Buenos_Aires')
  })
})
