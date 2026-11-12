// @vitest-environment jsdom
import { beforeEach, describe, it, expect } from 'vitest'
import {
  fijarRegionPublicaCliente,
  regionPublicaActual,
  __reiniciarRegionPublicaClienteParaPruebas,
} from './publica'
import { cargarRegion, regionPublica } from './index'

const manaosLike = () => ({
  ...regionPublica(cargarRegion('corrientes')),
  id: 'otra',
  nombre: 'Otra',
  pais: 'BR',
  zonaHoraria: 'America/Manaus',
  locale: 'pt-BR',
  idiomas: ['pt'] as ['pt'],
})

describe('regionPublicaActual in the browser (jsdom)', () => {
  beforeEach(() => __reiniciarRegionPublicaClienteParaPruebas())

  it('falls back to corrientes when nothing was stored', () => {
    expect(regionPublicaActual().id).toBe('corrientes')
    expect(regionPublicaActual().zonaHoraria).toBe('America/Argentina/Buenos_Aires')
  })

  it('returns the value stored by fijarRegionPublicaCliente', () => {
    fijarRegionPublicaCliente(manaosLike())
    expect(regionPublicaActual().zonaHoraria).toBe('America/Manaus')
    expect(regionPublicaActual().id).toBe('otra')
  })

  it('goes back to corrientes after the test reset', () => {
    fijarRegionPublicaCliente(manaosLike())
    __reiniciarRegionPublicaClienteParaPruebas()
    expect(regionPublicaActual().id).toBe('corrientes')
  })
})
