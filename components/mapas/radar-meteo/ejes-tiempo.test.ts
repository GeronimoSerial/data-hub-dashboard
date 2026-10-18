import { describe, expect, it } from 'vitest'
import { calcularMarcasEje } from './ejes-tiempo'

const zona = 'America/Argentina/Buenos_Aires'

describe('calcularMarcasEje', () => {
  it('aligns ticks to local 00 and 12 from UTC input', () => {
    const times = ['2026-10-16T12:00:00Z', '2026-10-17T00:00:00Z', '2026-10-17T12:00:00Z']
    const marcas = calcularMarcasEje(times, zona)
    expect(marcas.map((marca) => [marca.time, marca.label, marca.tipo])).toEqual([
      ['2026-10-16T15:00:00.000Z', '12', 'hora'],
      ['2026-10-17T03:00:00.000Z', 'sáb 17', 'dia'],
    ])
    expect(marcas[0].left).toBeCloseTo(12.5)
    expect(marcas[1].left).toBeCloseTo(62.5)
  })

  it('includes ticks that fall exactly on the first and last frame', () => {
    const times = ['2026-10-17T03:00:00Z', '2026-10-17T09:00:00Z', '2026-10-18T03:00:00Z']
    const marcas = calcularMarcasEje(times, zona)
    expect(marcas.map((marca) => [marca.label, marca.left])).toEqual([
      ['sáb 17', 0],
      ['12', 50],
      ['dom 18', 100],
    ])
  })

  it('returns no ticks for fewer than two frames', () => {
    expect(calcularMarcasEje(['2026-10-17T03:00:00Z'], zona)).toEqual([])
  })
})
