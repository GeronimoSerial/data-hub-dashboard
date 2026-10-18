import { describe, expect, it } from 'vitest'
import { obtenerEstacionesSynop, estacionSynopMasCercana } from './estaciones-synop'

describe('obtenerEstacionesSynop()', () => {
  it('declara las nueve estaciones SMN verificadas en Ogimet, con WMO único', () => {
    expect(obtenerEstacionesSynop().map((e) => e.wmo)).toEqual([
      '87155',
      '87166',
      '87173',
      '87178',
      '87187',
      '87270',
      '87281',
      '87289',
      '87393',
    ])
    expect(new Set(obtenerEstacionesSynop().map((e) => e.wmo)).size).toBe(obtenerEstacionesSynop().length)
  })

  it('no incluye Goya ni Santo Tomé, que no publican SYNOP en Ogimet', () => {
    const nombres = obtenerEstacionesSynop().map((e) => e.nombre.toLowerCase())
    expect(nombres.some((n) => n.includes('goya'))).toBe(false)
    expect(nombres.some((n) => n.includes('santo tom'))).toBe(false)
  })
})

describe('estacionSynopMasCercana', () => {
  it('resuelve el centro de Corrientes a la estación Corrientes Aero (87166)', () => {
    const resultado = estacionSynopMasCercana(-27.4698, -58.8341)
    expect(resultado?.estacion.wmo).toBe('87166')
    expect(resultado?.distanciaKm).toBeGreaterThan(0)
    expect(resultado?.distanciaKm).toBeLessThan(10)
  })

  it('devuelve null cuando ninguna estación está dentro del radio', () => {
    // Buenos Aires: a cientos de km de cualquier estación del catálogo.
    expect(estacionSynopMasCercana(-34.6037, -58.3816)).toBeNull()
  })

  it('respeta un radio explícito', () => {
    // Un punto a ~0,2° al este de Corrientes Aero (≈ 20 km): fuera de 10 km, dentro de 25 km.
    expect(estacionSynopMasCercana(-27.4497, -58.5597, 10)).toBeNull()
    expect(estacionSynopMasCercana(-27.4497, -58.5597)?.estacion.wmo).toBe('87166')
  })
})
