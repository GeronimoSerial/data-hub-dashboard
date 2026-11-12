import { describe, expect, it } from 'vitest'
import { CORRIENTES_BBOX } from './ruta-osrm'

describe('CORRIENTES_BBOX', () => {
  it('keeps the routing bbox literal', () => {
    expect(CORRIENTES_BBOX).toEqual({ latMin: -30.8, latMax: -27.0, lonMin: -59.7, lonMax: -55.6 })
  })
})
