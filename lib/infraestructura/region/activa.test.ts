import { afterEach, beforeEach, describe, it, expect } from 'vitest'
import { regionActiva, __reiniciarRegionActivaParaPruebas } from './activa'

const original = process.env.REGION

const fijarRegion = (valor: string | undefined) => {
  if (valor === undefined) delete process.env.REGION
  else process.env.REGION = valor
}

describe('regionActiva', () => {
  beforeEach(() => __reiniciarRegionActivaParaPruebas())
  afterEach(() => {
    fijarRegion(original)
    __reiniciarRegionActivaParaPruebas()
  })

  it('defaults to corrientes when REGION is unset', () => {
    fijarRegion(undefined)
    expect(regionActiva().id).toBe('corrientes')
  })

  it('accepts REGION=corrientes', () => {
    fijarRegion('corrientes')
    expect(regionActiva().id).toBe('corrientes')
  })

  it('trims surrounding whitespace', () => {
    fijarRegion('  corrientes ')
    expect(regionActiva().id).toBe('corrientes')
  })

  it('treats a blank REGION as unset', () => {
    fijarRegion('   ')
    expect(regionActiva().id).toBe('corrientes')
  })

  it('throws for an unknown REGION', () => {
    fijarRegion('atlantida')
    expect(() => regionActiva()).toThrow('REGION desconocida')
  })

  it('reads REGION once and caches the result', () => {
    fijarRegion('corrientes')
    expect(regionActiva().id).toBe('corrientes')
    fijarRegion('atlantida')
    expect(regionActiva().id).toBe('corrientes')
  })
})
