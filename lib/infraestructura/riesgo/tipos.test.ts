import { describe, expect, it } from 'vitest'
import {
  claseDatoSchema,
  estadoJobSchema,
  identidadCueAnexoSchema,
  tiempoUtcSchema,
} from './tipos'

describe('identidadCueAnexoSchema', () => {
  it('acepta un CUE-anexo con ceros a la izquierda preservándolos como string', () => {
    const resultado = identidadCueAnexoSchema.safeParse('007123')
    expect(resultado.success).toBe(true)
    if (resultado.success) expect(resultado.data).toBe('007123')
  })

  it('rechaza un string vacío', () => {
    expect(identidadCueAnexoSchema.safeParse('').success).toBe(false)
  })
})

describe('claseDatoSchema', () => {
  it('acepta las cuatro clases válidas', () => {
    for (const clase of ['observado', 'pronosticado', 'calculado', 'confirmado']) {
      expect(claseDatoSchema.safeParse(clase).success).toBe(true)
    }
  })

  it('rechaza valores fuera del set', () => {
    for (const valor of ['medido', 'estimado', 'Observado', '', 42]) {
      expect(claseDatoSchema.safeParse(valor).success).toBe(false)
    }
  })
})

describe('tiempoUtcSchema', () => {
  it('acepta un datetime ISO 8601 en UTC con Z', () => {
    expect(tiempoUtcSchema.safeParse('2026-09-23T14:00:00.000Z').success).toBe(true)
  })

  it('rechaza un datetime sin marca de zona horaria', () => {
    expect(tiempoUtcSchema.safeParse('2026-09-23T14:00:00').success).toBe(false)
  })

  it('rechaza un datetime con offset no nulo', () => {
    expect(tiempoUtcSchema.safeParse('2026-09-23T14:00:00+02:00').success).toBe(false)
  })

  it('rechaza strings que no son datetimes', () => {
    for (const valor of ['2026-09-23', 'no-es-fecha', '']) {
      expect(tiempoUtcSchema.safeParse(valor).success).toBe(false)
    }
  })
})

describe('estadoJobSchema', () => {
  it('acepta los cuatro estados válidos', () => {
    for (const estado of ['pendiente', 'en_progreso', 'completado', 'fallido']) {
      expect(estadoJobSchema.safeParse(estado).success).toBe(true)
    }
  })

  it('rechaza valores fuera del set', () => {
    for (const valor of ['cancelado', 'en-progreso', 'Completado', '']) {
      expect(estadoJobSchema.safeParse(valor).success).toBe(false)
    }
  })
})