import { describe, expect, it } from 'vitest'
import { dentroDeRangoVigencia, normalizarVigenciaRecibida, rangoVigencia, TOLERANCIA_RELOJ_MS } from './vigencia-rango'

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

// Un proceso con horario de verano movía el borde de 12 meses una hora: el
// reloj de Buenos Aires (UTC-3, sin horario de verano) no cambia.
describe('rangoVigencia con la zona del proceso distinta de Buenos Aires', () => {
  it('el borde de 12 meses conserva la hora de Buenos Aires aunque el proceso esté en Nueva York', () => {
    const previa = process.env.TZ
    process.env.TZ = 'America/New_York'
    try {
      // 2026-03-08 09:00 en Buenos Aires, justo el día que cambia el horario en EE. UU.
      const min = rangoVigencia(new Date('2026-03-08T12:00:00.000Z')).min
      expect(min.toISOString()).toBe('2025-03-08T12:00:00.000Z')
    } finally {
      if (previa === undefined) delete process.env.TZ
      else process.env.TZ = previa
    }
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

// El cliente fecha con el reloj de su PC y el servidor valida con el suyo:
// una PC con el reloj adelantado mandaba "ahora" en el futuro y el parte se
// rechazaba aunque el usuario no hubiera elegido ninguna fecha.
describe('normalizarVigenciaRecibida', () => {
  it('devuelve el mismo instante cuando está dentro de la ventana', () => {
    const hace1h = new Date(AHORA.getTime() - 3_600_000)
    expect(normalizarVigenciaRecibida(hace1h, AHORA)?.toISOString()).toBe(hace1h.toISOString())
  })

  it('recorta al "ahora" del servidor un instante futuro dentro de la tolerancia de reloj', () => {
    const adelantado = new Date(AHORA.getTime() + 90_000)
    expect(normalizarVigenciaRecibida(adelantado, AHORA)?.toISOString()).toBe(AHORA.toISOString())
    const enElBorde = new Date(AHORA.getTime() + TOLERANCIA_RELOJ_MS)
    expect(normalizarVigenciaRecibida(enElBorde, AHORA)?.toISOString()).toBe(AHORA.toISOString())
  })

  it('rechaza un instante futuro más allá de la tolerancia de reloj', () => {
    const lejos = new Date(AHORA.getTime() + TOLERANCIA_RELOJ_MS + 1000)
    expect(normalizarVigenciaRecibida(lejos, AHORA)).toBeNull()
  })

  it('rechaza un instante anterior a la ventana de 12 meses', () => {
    const viejo = new Date(rangoVigencia(AHORA).min.getTime() - 1000)
    expect(normalizarVigenciaRecibida(viejo, AHORA)).toBeNull()
  })
})
