import { describe, expect, it } from 'vitest'
import { formatearCargaCorta, formatearRigeDesde } from './historial-formato'

describe('historial-formato — zona horaria fija', () => {
  it('formatea la carga en la zona horaria de Corrientes, no en la del entorno de ejecución', () => {
    // 18 sep 2026 03:05 UTC = 18 sep 2026 00:05 en America/Argentina/Buenos_Aires (UTC-3)
    expect(formatearCargaCorta('2026-09-18T03:05:00.000Z')).toBe('18 sep · 00:05')
  })

  it('formatea la vigencia en la misma zona horaria fija', () => {
    expect(formatearRigeDesde('2026-09-18T03:05:00.000Z')).toBe('Rige desde el 18 de septiembre a las 00:05')
  })

  it('no se corre de día cuando la hora UTC ya cruzó la medianoche de Corrientes', () => {
    // 1 sep 2026 02:30 UTC = 31 ago 2026 23:30 en Corrientes (UTC-3): el día tiene que quedar en agosto.
    expect(formatearCargaCorta('2026-09-01T02:30:00.000Z')).toBe('31 ago · 23:30')
  })
})
