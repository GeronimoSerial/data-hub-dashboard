import { describe, expect, it } from 'vitest'
import { MAP_CENTER, MAP_ZOOM } from './map-types'

// Characterization: the map center and zoom Corrientes produced before the region was configurable.
describe('MAP_CENTER and MAP_ZOOM', () => {
  it('keep the Corrientes center', () => {
    expect(MAP_CENTER).toEqual([-58.215, -28.811])
  })

  it('keep the Corrientes zoom', () => {
    expect(MAP_ZOOM).toBe(8)
  })
})
