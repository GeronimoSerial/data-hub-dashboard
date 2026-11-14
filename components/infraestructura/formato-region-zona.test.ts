import { describe, expect, it } from 'vitest'
import { formatearMomento } from './estado-actual-textos'
import { formatearFechaHistorial, formatearMomentoHistorial } from './historial-formato'

// Expected strings were produced by the previous hardcoded
// Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }) calls.
describe('formato de fecha y hora en la región activa (Corrientes)', () => {
  it('formatearMomento muestra el día en español y la hora en la zona de Corrientes', () => {
    // 13:30 UTC = 10:30 en Corrientes (UTC-3)
    expect(formatearMomento('2026-09-18T13:30:00.000Z')).toBe('18 de septiembre, 10:30')
  })

  it('formatearMomento cruza la medianoche según la zona de Corrientes', () => {
    // 02:30 UTC del 1 de septiembre = 23:30 del 31 de agosto en Corrientes
    expect(formatearMomento('2026-09-01T02:30:00.000Z')).toBe('31 de agosto, 23:30')
  })

  it('formatearMomentoHistorial marca "Hoy" con la fecha de referencia en la zona de Corrientes', () => {
    const ahora = new Date('2026-09-18T20:00:00.000Z')
    expect(formatearMomentoHistorial('2026-09-18T13:30:00.000Z', ahora)).toBe('Hoy, 10:30')
  })

  it('formatearMomentoHistorial usa el nombre del mes en español fuera de hoy', () => {
    const ahora = new Date('2026-09-20T12:00:00.000Z')
    expect(formatearMomentoHistorial('2026-09-18T13:30:00.000Z', ahora)).toBe('18 de septiembre, 10:30')
  })

  it('formatearFechaHistorial convierte una fecha dd/mm/aaaa a "d de mes"', () => {
    expect(formatearFechaHistorial('18/09/2026')).toBe('18 de septiembre')
  })
})
