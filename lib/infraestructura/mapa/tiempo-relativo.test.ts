import { describe, expect, it } from 'vitest'
import { tiempoRelativo } from './tiempo-relativo'

describe('tiempoRelativo', () => {
  const ahora = Date.parse('2026-10-05T15:00:00.000Z')

  it('expresa minutos, horas y días transcurridos', () => {
    expect(tiempoRelativo('2026-10-05T14:50:00.000Z', ahora)).toBe('hace 10\u00A0min')
    expect(tiempoRelativo('2026-10-05T12:00:00.000Z', ahora)).toBe('hace 3\u00A0h')
    expect(tiempoRelativo('2026-10-03T15:00:00.000Z', ahora)).toBe('hace 2\u00A0d')
  })

  it('separa el número y la unidad con un espacio de no separación', () => {
    expect(tiempoRelativo('2026-10-05T14:50:00.000Z', ahora)).toContain('\u00A0min')
    expect(tiempoRelativo('2026-10-05T12:00:00.000Z', ahora)).toContain('\u00A0h')
    expect(tiempoRelativo('2026-10-03T15:00:00.000Z', ahora)).toContain('\u00A0d')
  })

  it('maneja fechas inválidas y fechas futuras sin resultados confusos', () => {
    expect(tiempoRelativo('no-es-fecha', ahora)).toBe('')
    expect(tiempoRelativo('2026-10-06T15:00:00.000Z', ahora)).toBe('hace 0\u00A0min')
  })
})
