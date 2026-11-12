import { describe, expect, it } from 'vitest'
import { IMERG_LAT_MAX, IMERG_LAT_MIN, IMERG_LON_MAX, IMERG_LON_MIN } from './imerg'

describe('IMERG Corrientes bbox', () => {
  it('keeps the plausible-bbox literals', () => {
    expect([IMERG_LAT_MIN, IMERG_LAT_MAX, IMERG_LON_MIN, IMERG_LON_MAX]).toEqual([-32, -26, -61, -54])
  })
})
