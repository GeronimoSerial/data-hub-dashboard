import { describe, expect, it } from 'vitest'
import { trazoSparkline } from './sparkline'

const serie = [
  { medidaEn: '2026-10-15T00:00:00Z', lecturaM: 2 },
  { medidaEn: '2026-10-16T00:00:00Z', lecturaM: null },
  { medidaEn: '2026-10-17T00:00:00Z', lecturaM: 3 },
]

describe('trazoSparkline', () => {
  it('maps time to x and level to y (higher level, smaller y), skipping gaps', () => {
    const t = trazoSparkline(serie, { ancho: 100, alto: 40, margen: 0 })!
    expect(t.path).toBe('M0,40 L100,0')
    expect(t.ultimo).toEqual({ x: 100, y: 0 })
  })
  it('widens the y range to include thresholds so their lines are drawn', () => {
    const t = trazoSparkline(serie, { ancho: 100, alto: 40, margen: 0, umbrales: [4, null] })!
    expect(t.lineas).toEqual([{ valor: 4, y: 0 }])
    expect(t.path).toBe('M0,40 L100,20')
  })
  it('returns null without at least two levels', () => {
    expect(trazoSparkline([serie[0]], { ancho: 100, alto: 40 })).toBeNull()
  })
  it('draws a flat series in the middle', () => {
    const t = trazoSparkline([serie[0], { ...serie[2], lecturaM: 2 }], { ancho: 100, alto: 40, margen: 0 })!
    expect(t.path).toBe('M0,20 L100,20')
  })
})
