import { describe, expect, it } from 'vitest'
import { fechaArt, rangoUtcDeDiaArt, sumarDias } from './dia'

describe('rangoUtcDeDiaArt', () => {
  it('devuelve la ventana UTC del día civil ART (UTC−3)', () => {
    expect(rangoUtcDeDiaArt('2026-10-12')).toEqual({
      desde: '2026-10-12T03:00:00.000Z',
      hasta: '2026-10-13T03:00:00.000Z',
    })
  })

  it('cruza correctamente el cambio de mes y de año', () => {
    expect(rangoUtcDeDiaArt('2026-12-31')).toEqual({
      desde: '2026-12-31T03:00:00.000Z',
      hasta: '2027-01-01T03:00:00.000Z',
    })
  })
})

describe('fechaArt', () => {
  it('ubica un instante UTC en el día civil ART', () => {
    // 02:59Z aún es el día anterior en ART (23:59 del 11).
    expect(fechaArt(new Date('2026-10-12T02:59:00.000Z'))).toBe('2026-10-11')
    expect(fechaArt(new Date('2026-10-12T03:00:00.000Z'))).toBe('2026-10-12')
  })

  it('es inversa de rangoUtcDeDiaArt en los bordes del día', () => {
    const { desde, hasta } = rangoUtcDeDiaArt('2026-10-12')
    expect(fechaArt(new Date(desde))).toBe('2026-10-12')
    expect(fechaArt(new Date(new Date(hasta).getTime() - 1))).toBe('2026-10-12')
    expect(fechaArt(new Date(hasta))).toBe('2026-10-13')
  })
})

describe('sumarDias', () => {
  it('suma y resta días respetando meses y años bisiestos', () => {
    expect(sumarDias('2026-10-12', 1)).toBe('2026-10-13')
    expect(sumarDias('2026-10-12', -2)).toBe('2026-10-10')
    expect(sumarDias('2026-02-28', 1)).toBe('2026-03-01')
    expect(sumarDias('2028-02-28', 1)).toBe('2028-02-29')
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01')
  })
})
