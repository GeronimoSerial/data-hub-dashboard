import { describe, it, expect } from 'vitest'
import { REGIONES_CONOCIDAS, cargarRegion } from './registro'

describe('region registry', () => {
  it('lists the registered regions', () => {
    expect(REGIONES_CONOCIDAS).toEqual(['corrientes', 'manaos'])
  })

  it('loads corrientes', () => {
    expect(cargarRegion('corrientes').id).toBe('corrientes')
  })

  it('throws a descriptive error for an unknown id', () => {
    expect(() => cargarRegion('atlantida')).toThrow(
      'REGION desconocida: "atlantida". Regiones disponibles: corrientes',
    )
  })
})
