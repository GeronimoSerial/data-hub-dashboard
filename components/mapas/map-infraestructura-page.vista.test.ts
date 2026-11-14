import { describe, expect, it } from 'vitest'
import { vistaRadarDeRegion } from './map-infraestructura-page'
import { cargarRegion, regionPublica } from '@/lib/infraestructura/region'

// Characterization: the radar flyTo target Corrientes produced before the region was configurable.
describe('vistaRadarDeRegion', () => {
  it('keeps the Corrientes radar view', () => {
    const vista = vistaRadarDeRegion(regionPublica(cargarRegion('corrientes')))
    expect(vista).toEqual({ center: [-58.15, -29.55], zoom: 6.3 })
  })
})
