import { describe, expect, it } from 'vitest'
import { categoriaGranizo, type EntradaGranizo } from './granizo'

const base: EntradaGranizo = {
  weather_code: 3,
  precipitation_probability: 60,
  cape: 1200,
  lifted_index: -1,
  wind_gusts_10m: 20,
  freezing_level_height: 3000,
}

describe('categoriaGranizo', () => {
  it.each([
    ['sin señal', { ...base, precipitation_probability: 39 }, 0],
    ['compuerta CAPE', { ...base, cape: 499 }, 0],
    ['nivel bajo', base, 1],
    ['nivel medio', { ...base, cape: 2000, lifted_index: -2 }, 2],
    ['código WMO 96', { ...base, weather_code: 96 }, 2],
    ['código WMO 99', { ...base, weather_code: 99 }, 3],
    ['ráfaga eleva el nivel', { ...base, wind_gusts_10m: 50 }, 2],
    ['congelación alta reduce el nivel', { ...base, freezing_level_height: 4501 }, 0],
    ['WMO domina un entorno menor', { ...base, weather_code: 99 }, 3],
  ])('%s', (_nombre, entrada, esperado) => {
    expect(categoriaGranizo(entrada as EntradaGranizo)).toBe(esperado)
  })

  it('no trata ráfagas aisladas como granizo', () => {
    expect(categoriaGranizo({ ...base, precipitation_probability: 20, cape: 200, wind_gusts_10m: 80 })).toBe(0)
  })

  it.each([
    { ...base, precipitation_probability: null },
    { ...base, cape: null },
    { ...base, lifted_index: null },
  ])('devuelve desconocido ante entradas faltantes de la compuerta', (entrada) => {
    expect(categoriaGranizo(entrada)).toBeNull()
  })

  it('conserva la señal WMO cuando faltan datos ambientales', () => {
    expect(categoriaGranizo({ ...base, weather_code: 96, cape: null })).toBe(2)
  })
})
