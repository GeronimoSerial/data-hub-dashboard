import { describe, expect, it } from 'vitest'
import { nivelInUseTotal } from './taxonomia'

describe('nivelInUseTotal', () => {
  it('is zero only when no recurso, user, or audiencia row references the nivel', () => {
    expect(
      nivelInUseTotal({ recursos: 0, userNiveles: 0, audienciaNiveles: 0 }),
    ).toBe(0)
  })

  it('counts user_niveles even when no recurso uses the nivel as nivelId', () => {
    expect(
      nivelInUseTotal({ recursos: 0, userNiveles: 1, audienciaNiveles: 0 }),
    ).toBe(1)
  })

  it('counts recurso_audiencia_niveles even when no recurso uses the nivel as nivelId', () => {
    expect(
      nivelInUseTotal({ recursos: 0, userNiveles: 0, audienciaNiveles: 2 }),
    ).toBe(2)
  })

  it('sums all three FK sources so DELETE can 400 instead of 500', () => {
    expect(
      nivelInUseTotal({ recursos: 1, userNiveles: 1, audienciaNiveles: 1 }),
    ).toBe(3)
  })
})
