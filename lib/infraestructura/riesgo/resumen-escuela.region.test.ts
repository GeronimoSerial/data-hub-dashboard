import { describe, expect, it } from 'vitest'
import { fechaCorta } from './resumen-escuela'

describe('fechaCorta del resumen de escuela', () => {
  it('muestra la fecha y hora locales de Corrientes', () => {
    expect(fechaCorta('2026-11-12T15:30:00Z')).toBe('12/11 12:30')
  })
})
