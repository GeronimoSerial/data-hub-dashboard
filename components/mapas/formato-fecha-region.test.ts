import { describe, expect, it } from 'vitest'
import { formatoFechaRegion } from './formato-fecha-region'
import { fechaRadar } from './radar-meteo/escalas'

// 18:00 UTC is 15:00 in Buenos Aires (UTC-3, no DST). Expected strings were
// produced by the previous hardcoded es-AR + America/Argentina/Buenos_Aires formatters.
const INSTANTE = '2026-10-01T18:00:00Z'

describe('fechaRadar with the active region time zone and locale', () => {
  it('formats a 24-hour clock time in the region zone', () => {
    expect(fechaRadar(INSTANTE, { hour: '2-digit', minute: '2-digit', hour12: false })).toBe('15:00')
  })

  it('formats a weekday, day and month in the region locale', () => {
    expect(fechaRadar(INSTANTE, { weekday: 'short', day: 'numeric', month: 'short' })).toBe('jue, 1 oct')
  })

  it('formats a day and month with a 24-hour time', () => {
    expect(fechaRadar(INSTANTE, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })).toBe('1 oct, 15:00')
  })
})

describe('formatoFechaRegion', () => {
  it('formats a numeric day/month/year with a 12-hour clock like the previous es-AR formatter', () => {
    const formato = formatoFechaRegion({ day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    expect(formato.format(new Date(INSTANTE))).toBe('01/10/2026, 03:00 p. m.')
  })

  it('uses the region zone for day-only formats', () => {
    expect(formatoFechaRegion({ day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(INSTANTE)))
      .toBe('1/10, 15:00')
  })

  it('returns the same instance for the same options and a different one for other options', () => {
    const a = formatoFechaRegion({ day: 'numeric', month: 'short' })
    expect(formatoFechaRegion({ day: 'numeric', month: 'short' })).toBe(a)
    expect(formatoFechaRegion({ day: '2-digit' })).not.toBe(a)
  })
})
