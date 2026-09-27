import { describe, expect, it } from 'vitest'
import {
  estadoFuenteSchema,
  hazardClimatologiaPuntoSchema,
  hazardForecastPuntoSchema,
  hazardSourceHealthEntradaSchema,
  hazardVariableSchema,
} from './tipos-hazard'

const forecastValido = {
  variable: 'precipitacion',
  geometryRef: 'cue-1800001',
  corridaEn: '2026-09-23T00:00:00.000Z',
  validoEn: '2026-09-23T06:00:00.000Z',
  horizonteHoras: 6,
  valor: 12.5,
  unidad: 'mm',
  pasoHoras: 3,
}

describe('hazardVariableSchema', () => {
  it('acepta las variables válidas', () => {
    for (const variable of ['precipitacion', 'cape', 'rafagas', 'temperatura', 'viento', 'caudal']) {
      expect(hazardVariableSchema.safeParse(variable).success).toBe(true)
    }
  })

  it('rechaza una variable fuera del set', () => {
    expect(hazardVariableSchema.safeParse('granizo').success).toBe(false)
  })
})

describe('estadoFuenteSchema', () => {
  it('acepta los estados válidos', () => {
    for (const estado of ['ok', 'degradado', 'no_disponible']) {
      expect(estadoFuenteSchema.safeParse(estado).success).toBe(true)
    }
  })

  it('rechaza un estado fuera del set', () => {
    expect(estadoFuenteSchema.safeParse('caido').success).toBe(false)
  })
})

describe('hazardForecastPuntoSchema', () => {
  it('acepta un punto de pronóstico válido', () => {
    expect(hazardForecastPuntoSchema.safeParse(forecastValido).success).toBe(true)
  })

  it('rechaza pasoHoras distinto de 1|3|6', () => {
    expect(hazardForecastPuntoSchema.safeParse({ ...forecastValido, pasoHoras: 2 }).success).toBe(false)
  })

  it('rechaza horizonteHoras negativo', () => {
    expect(
      hazardForecastPuntoSchema.safeParse({ ...forecastValido, horizonteHoras: -1 }).success,
    ).toBe(false)
  })

  it('rechaza horizonteHoras no entero', () => {
    expect(
      hazardForecastPuntoSchema.safeParse({ ...forecastValido, horizonteHoras: 1.5 }).success,
    ).toBe(false)
  })
})

describe('hazardClimatologiaPuntoSchema', () => {
  const climaValida = {
    geometryRef: 'cue-1800001',
    variable: 'precipitacion_diaria',
    percentil: 'p95',
    muestra: 'dias_humedos',
    valor: 48.2,
    unidad: 'mm',
    periodoDesde: '1991-01-01',
    periodoHasta: '2020-12-31',
  }

  it('acepta un punto de climatología válido', () => {
    expect(hazardClimatologiaPuntoSchema.safeParse(climaValida).success).toBe(true)
  })

  it('rechaza un percentil fuera del set', () => {
    expect(
      hazardClimatologiaPuntoSchema.safeParse({ ...climaValida, percentil: 'p75' }).success,
    ).toBe(false)
  })

  it('rechaza una variable distinta de precipitacion_diaria', () => {
    expect(
      hazardClimatologiaPuntoSchema.safeParse({ ...climaValida, variable: 'precipitacion' }).success,
    ).toBe(false)
  })
})

describe('hazardSourceHealthEntradaSchema', () => {
  const saludValida = {
    provider: 'open-meteo',
    estado: 'ok',
    ultimoExitoEn: '2026-09-23T00:00:00.000Z',
    ultimoIntentoEn: '2026-09-23T00:00:00.000Z',
    ultimoErrorSaneado: null,
    ttlMinutos: 60,
    licencia: 'CC-BY-4.0',
  }

  it('acepta una entrada de salud válida', () => {
    expect(hazardSourceHealthEntradaSchema.safeParse(saludValida).success).toBe(true)
  })

  it('rechaza ttlMinutos no positivo', () => {
    expect(
      hazardSourceHealthEntradaSchema.safeParse({ ...saludValida, ttlMinutos: 0 }).success,
    ).toBe(false)
  })

  it('rechaza ttlMinutos no entero', () => {
    expect(
      hazardSourceHealthEntradaSchema.safeParse({ ...saludValida, ttlMinutos: 1.5 }).success,
    ).toBe(false)
  })
})
