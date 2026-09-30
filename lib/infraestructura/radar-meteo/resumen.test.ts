import { describe, expect, it } from 'vitest'
import { generarGrilla } from './grilla'
import { asignarCeldasADepartamentos, listarDepartamentos } from './departamentos'
import { calcularResumen } from './resumen'
import { interpolarBilineal } from './interpolacion'

describe('base espacial y resumen de departamentos', () => {
  it('asigna celdas a los 25 departamentos con pesos normalizados y versión', () => {
    const asignaciones = asignarCeldasADepartamentos(generarGrilla())
    expect(listarDepartamentos()).toHaveLength(25)
    const pesos = new Map<string, number>()
    for (const fila of asignaciones) pesos.set(fila.departamentoId, (pesos.get(fila.departamentoId) ?? 0) + fila.peso)
    expect(pesos.size).toBe(25)
    expect([...pesos.values()].every((n) => Math.abs(n - 1) < 1e-9)).toBe(true)
    expect(asignaciones.every((a) => a.gridVersion && a.geoVersion)).toBe(true)
  })

  it('agrega horas por día local, pondera celdas, informa cobertura y resaltados propios', () => {
    const celdas = generarGrilla()
    const depto = listarDepartamentos()[0]
    const asignaciones = asignarCeldasADepartamentos(celdas)
    const indices = asignaciones.flatMap((a, i) => a.departamentoId === depto.id ? [i] : [])
    const base = Date.parse('2026-10-01T02:00:00Z') // 30 Sep, 23:00 local
    const times = Array.from({ length: 48 }, (_, i) => new Date(base + i * 3600000).toISOString())
    const precipitation = celdas.map((_, i) => times.map((_, h) => indices.includes(i) && h < 2 ? (i === indices[0] ? 25 : 75) : 0))
    const gust = celdas.map((_, i) => times.map(() => indices.includes(i) ? 85 : 0))
    const weather = celdas.map(() => times.map(() => 0))
    const result = calcularResumen({ times, cells: celdas, values: { precipitation, wind_gusts_10m: gust, weather_code: weather } }, new Date(base))
    const department = result.departamentos.find((d) => d.id === depto.id)!
    expect(department.dias[0].fecha).toBe('2026-09-30')
    expect(department.dias[0].lluvia24h).toBeGreaterThan(25)
    expect(department.dias[0].rafagaMaxKmh).toBe(85)
    expect(department.dias[0].resaltado).toEqual({ lluvia: 'importante', rafaga: 'importante' })
    expect(department.dias[0].cobertura).toBe(100)
  })

  it('starts at the current Buenos Aires day when the UTC run begins the prior local evening', () => {
    const cells = [{ id: 'c', lat: -27.5, lon: -58.8 }]
    const times = ['2026-09-30T00:00:00Z', '2026-09-30T03:00:00Z', '2026-10-01T03:00:00Z']
    const result = calcularResumen({ times, cells, values: { precipitation: [[1, 2, 3]] } }, new Date('2026-09-30T12:00:00Z'))
    expect(result.dias[0]).toBe('2026-09-30')
    expect(result.dias).not.toContain('2026-09-29')
  })

  it('interpolates while preserving the existing null-cell behavior', () => {
    expect(interpolarBilineal({ filas: 2, columnas: 2 }, [0, 10, 20, 30], 0.5, 0.5)).toBe(15)
    expect(interpolarBilineal({ filas: 2, columnas: 2 }, [null, 10, 20, 30], 0, 0)).toBeNull()
  })
})
