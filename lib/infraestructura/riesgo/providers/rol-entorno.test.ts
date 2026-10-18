import { describe, expect, it } from 'vitest'
import {
  asegurarProductorOpenMeteo,
  JOBS_OPEN_METEO,
  RolConsumidorError,
  rolEntorno,
} from './rol-entorno'

describe('rolEntorno', () => {
  it('sin configuración ni base conocida es productor (producción no cambia)', () => {
    expect(rolEntorno({})).toBe('productor')
    expect(rolEntorno({ DATABASE_URL: 'postgresql://u:p@h/hub_prod' })).toBe('productor')
  })

  it.each(['hub_staging', 'hub_dev'])('infiere consumidor desde DATABASE_URL de %s', (db) => {
    expect(rolEntorno({ DATABASE_URL: `postgres://u:p@h:5432/${db}?sslmode=require` })).toBe('consumidor')
  })

  it('el valor explícito gana sobre la inferencia', () => {
    expect(rolEntorno({ RIESGO_DATOS_ROL: 'consumidor', DATABASE_URL: 'postgres://h/hub_prod' })).toBe('consumidor')
    expect(rolEntorno({ RIESGO_DATOS_ROL: ' Productor ', DATABASE_URL: 'postgres://h/hub_dev' })).toBe('productor')
  })

  it('un valor inválido nunca gasta cupo', () => {
    expect(rolEntorno({ RIESGO_DATOS_ROL: 'prod' })).toBe('consumidor')
    expect(rolEntorno({ RIESGO_DATOS_ROL: '' , DATABASE_URL: 'no-es-url' })).toBe('consumidor')
  })
})

describe('asegurarProductorOpenMeteo', () => {
  it('lanza en rol consumidor y no en productor', () => {
    expect(() => asegurarProductorOpenMeteo({ RIESGO_DATOS_ROL: 'consumidor' })).toThrow(RolConsumidorError)
    expect(() => asegurarProductorOpenMeteo({})).not.toThrow()
  })
})

it('lista los productores Open-Meteo de jobs.mjs', () => {
  expect([...JOBS_OPEN_METEO].sort()).toEqual([
    'climatologia-caudal',
    'climatologia-precipitacion',
    'sync-ensemble',
    'sync-pronostico-caudal',
    'sync-radar-ensemble',
    'sync-radar-meteo',
    'sync-seasonal',
    'verificar-radar-meteo',
  ])
})
