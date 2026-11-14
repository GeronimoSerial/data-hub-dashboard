import { afterEach, beforeEach, describe, it, expect } from 'vitest'
import { regionActiva, __reiniciarRegionActivaParaPruebas } from './activa'
import { regionPublica } from './esquema'

const original = process.env.REGION

describe('regionActiva con REGION=manaos', () => {
  beforeEach(() => {
    process.env.REGION = 'manaos'
    __reiniciarRegionActivaParaPruebas()
  })
  afterEach(() => {
    if (original === undefined) delete process.env.REGION
    else process.env.REGION = original
    __reiniciarRegionActivaParaPruebas()
  })

  it('loads the manaos identity, locale, timezone and languages', () => {
    const region = regionActiva()
    expect(region.id).toBe('manaos')
    expect(region.locale).toBe('pt-BR')
    expect(region.zonaHoraria).toBe('America/Manaus')
    expect(region.idiomas).toEqual(['pt', 'es'])
  })

  it('public projection carries no estacionAncla', () => {
    const publica = regionPublica(regionActiva())
    expect(publica).not.toHaveProperty('estacionAncla')
    expect(publica.id).toBe('manaos')
  })
})
