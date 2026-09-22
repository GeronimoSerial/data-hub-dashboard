import { describe, expect, it } from 'vitest'
import { dentroDeRangoVigencia, rangoVigencia } from './vigencia-rango'

const AHORA = new Date('2026-09-21T12:00:00.000Z')

describe('rangoVigencia', () => {
  it('devuelve [ahora - 12 meses, ahora] a partir de un "ahora" inyectado', () => {
    const { min, max } = rangoVigencia(AHORA)

    expect(max.toISOString()).toBe(AHORA.toISOString())
    expect(min.getUTCFullYear()).toBe(2025)
    expect(min.getUTCMonth()).toBe(AHORA.getUTCMonth())
    expect(min.getUTCDate()).toBe(AHORA.getUTCDate())
  })

  it('sin argumento usa el reloj real, no un valor fijo', () => {
    const antes = Date.now()
    const { max } = rangoVigencia()
    const despues = Date.now()

    expect(max.getTime()).toBeGreaterThanOrEqual(antes)
    expect(max.getTime()).toBeLessThanOrEqual(despues)
  })
})

describe('dentroDeRangoVigencia', () => {
  it('acepta el propio "ahora" y el borde de 12 meses atrás', () => {
    expect(dentroDeRangoVigencia(AHORA, AHORA)).toBe(true)
    expect(dentroDeRangoVigencia(rangoVigencia(AHORA).min, AHORA)).toBe(true)
  })

  it('rechaza un instante posterior a "ahora" (issue #29)', () => {
    const unSegundoDespues = new Date(AHORA.getTime() + 1000)
    expect(dentroDeRangoVigencia(unSegundoDespues, AHORA)).toBe(false)
  })

  it('rechaza un instante anterior a la ventana de 12 meses (issue #30)', () => {
    const unSegundoAntesDelLimite = new Date(rangoVigencia(AHORA).min.getTime() - 1000)
    expect(dentroDeRangoVigencia(unSegundoAntesDelLimite, AHORA)).toBe(false)
  })
})
