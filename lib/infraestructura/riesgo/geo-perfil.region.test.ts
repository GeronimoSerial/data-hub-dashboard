import { describe, expect, it } from 'vitest'
import { regionActiva } from '@/lib/infraestructura/region'

describe('geo-perfil plausible bounds (read from the region config)', () => {
  it('keeps the Corrientes plausible bounds', () => {
    const { latMin, latMax, lonMin, lonMax } = regionActiva().bboxPlausible
    expect([latMin, latMax, lonMin, lonMax]).toEqual([-32, -26, -61, -54])
  })
})
