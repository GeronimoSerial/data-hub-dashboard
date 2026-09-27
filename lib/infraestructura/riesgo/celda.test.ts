import { describe, expect, it } from 'vitest'
import { agruparEnCeldas, celdaDeCoordenada } from './celda'

describe('celdaDeCoordenada', () => {
  it('redondea a un decimal y arma "lat_lon"', () => {
    expect(celdaDeCoordenada(-27.46, -58.83)).toBe('-27.5_-58.8')
  })

  it('redondea hacia arriba cuando el segundo decimal es 5 o más', () => {
    expect(celdaDeCoordenada(10.05, 20.09)).toBe('10.1_20.1')
  })

  it('conserva coordenadas del hemisferio sur/oeste (Corrientes)', () => {
    // Corrientes está entre lat -27 y -30 y lon -55 y -60.
    expect(celdaDeCoordenada(-27.0, -55.0)).toBe('-27.0_-55.0')
    expect(celdaDeCoordenada(-30.0, -60.0)).toBe('-30.0_-60.0')
    expect(celdaDeCoordenada(-27.55, -58.91)).toBe('-27.5_-58.9')
  })

  it('lanza un error con NaN', () => {
    expect(() => celdaDeCoordenada(Number.NaN, -58.83)).toThrow()
    expect(() => celdaDeCoordenada(-27.46, Number.NaN)).toThrow()
  })

  it('lanza un error con Infinity', () => {
    expect(() => celdaDeCoordenada(Number.POSITIVE_INFINITY, -58.83)).toThrow()
    expect(() => celdaDeCoordenada(-27.46, Number.NEGATIVE_INFINITY)).toThrow()
  })
})

describe('agruparEnCeldas', () => {
  it('deduplica coordenadas cercanas a la misma celda', () => {
    const items = [
      { id: 'a', lat: -27.46, lon: -58.83 },
      { id: 'b', lat: -27.48, lon: -58.81 },
    ]
    const celdas = agruparEnCeldas(items, (item) => ({ lat: item.lat, lon: item.lon }))
    expect(celdas.size).toBe(1)
    expect(celdas.get('-27.5_-58.8')?.map((i) => i.id)).toEqual(['a', 'b'])
  })

  it('arma un Map con claves distintas por celda', () => {
    const items = [
      { id: 'a', lat: -27.46, lon: -58.83 },
      { id: 'b', lat: -28.94, lon: -58.76 },
    ]
    const celdas = agruparEnCeldas(items, (item) => ({ lat: item.lat, lon: item.lon }))
    expect([...celdas.keys()].sort()).toEqual(['-27.5_-58.8', '-28.9_-58.8'])
    expect(celdas.get('-27.5_-58.8')?.map((i) => i.id)).toEqual(['a'])
    expect(celdas.get('-28.9_-58.8')?.map((i) => i.id)).toEqual(['b'])
  })

  it('excluye los items cuyo coord() devuelve null', () => {
    const items = [
      { id: 'a', lat: -27.46, lon: -58.83 },
      { id: 'sin-coord', lat: null as number | null, lon: null as number | null },
    ]
    const celdas = agruparEnCeldas(items, (item) =>
      item.lat === null || item.lon === null ? null : { lat: item.lat, lon: item.lon },
    )
    expect(celdas.size).toBe(1)
    expect(celdas.get('-27.5_-58.8')?.map((i) => i.id)).toEqual(['a'])
  })
})
