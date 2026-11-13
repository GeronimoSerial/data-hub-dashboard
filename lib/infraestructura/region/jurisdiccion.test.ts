import { afterEach, describe, expect, it, vi } from 'vitest'
import { jurisdiccionCorta } from './publica'
import { __reiniciarRegionActivaParaPruebas } from './activa'

afterEach(() => {
  vi.unstubAllEnvs()
  __reiniciarRegionActivaParaPruebas()
})

describe('jurisdiccionCorta', () => {
  it('Corrientes: "Corrientes"', () => {
    vi.stubEnv('REGION', '')
    __reiniciarRegionActivaParaPruebas()
    expect(jurisdiccionCorta()).toBe('Corrientes')
  })

  it('Manaos: "Amazonas", tomada de la configuración', () => {
    vi.stubEnv('REGION', 'manaos')
    __reiniciarRegionActivaParaPruebas()
    expect(jurisdiccionCorta()).toBe('Amazonas')
  })
})
