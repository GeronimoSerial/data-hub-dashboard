import { describe, expect, it } from 'vitest'
import { LIMITES_CORRIENTES, LIMITES_CORRIENTES_BBOX } from './departamentos'

describe('Corrientes map limits', () => {
  it('keeps the MapLibre bounds literal', () => {
    expect(LIMITES_CORRIENTES).toEqual([
      [-59.710824, -30.730192],
      [-55.620259, -27.253966],
    ])
  })

  it('keeps the flattened bbox derived from the same bounds', () => {
    expect(LIMITES_CORRIENTES_BBOX).toEqual([-59.710824, -30.730192, -55.620259, -27.253966])
  })
})
