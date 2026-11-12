import { describe, expect, it } from 'vitest'
import { formatoFechaRegion, localeRegion, zonaHorariaRegion } from './formato-region'

const INSTANTE = new Date('2026-11-12T15:30:00Z')

describe('formato de fecha por región', () => {
  it('toma zona y locale de la región activa (Corrientes)', () => {
    expect(zonaHorariaRegion()).toBe('America/Argentina/Buenos_Aires')
    expect(localeRegion()).toBe('es-AR')
  })

  it('formatea con la zona regional el mismo texto que la fórmula anterior', () => {
    expect(formatoFechaRegion('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(INSTANTE)).toBe('2026-11-12')
    expect(formatoFechaRegion('en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(INSTANTE)).toBe('12/11, 12:30')
  })

  it('reutiliza el mismo formateador para la misma configuración', () => {
    const opciones = { day: '2-digit', month: '2-digit' } as const
    expect(formatoFechaRegion('es-AR', opciones)).toBe(formatoFechaRegion('es-AR', opciones))
    expect(formatoFechaRegion('es-AR', opciones)).not.toBe(formatoFechaRegion('en-GB', opciones))
  })
})
