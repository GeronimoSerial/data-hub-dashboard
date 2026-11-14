import { describe, expect, it } from 'vitest'
import { offsetUtilizable } from './altura-critica'

describe('offset calibrado por región', () => {
  it('corrientes conserva la calibración del ancla y de las demás estaciones', () => {
    expect(offsetUtilizable('pna-corrientes', 'corrientes')?.aM).toBe(41.35)
    expect(offsetUtilizable('pna-itati', 'corrientes')?.aM).toBe(44.5)
  })

  it('una región sin calibración no usa offsets (null)', () => {
    expect(offsetUtilizable('pna-corrientes', 'otra')).toBeNull()
    expect(offsetUtilizable('pna-itati', 'otra')).toBeNull()
  })
})
