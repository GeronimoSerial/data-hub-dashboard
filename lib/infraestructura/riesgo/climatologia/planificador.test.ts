import { describe, expect, it } from 'vitest'
import { planificarDescargas } from './planificador'

const celdaA = { celdaEra5: 'A', lat: -34.6, lon: -58.4 }
const celdaB = { celdaEra5: 'B', lat: -31.4, lon: -64.2 }
const celdaC = { celdaEra5: 'C', lat: -24.1, lon: -65.3 }

function base(overrides: Partial<Parameters<typeof planificarDescargas>[0]> = {}) {
  return {
    celdas: [celdaA, celdaB],
    aniosGuardados: new Set<string>(),
    anioDesde: 2019,
    anioHasta: 2020,
    pesoMaximoPorRequest: 480,
    pesoDisponible: 100_000,
    variables: 1,
    ...overrides,
  }
}

describe('planificarDescargas', () => {
  it('pide primero el año más reciente para todas las celdas antes de bajar años anteriores', () => {
    const plan = planificarDescargas(base())

    expect(plan.map((lote) => lote.anio)).toEqual([2020, 2019])
    expect(plan[0].celdas.map((celda) => celda.celdaEra5)).toEqual(['A', 'B'])
    expect(plan[1].celdas.map((celda) => celda.celdaEra5)).toEqual(['A', 'B'])
    expect(plan[0].celdas[0]).toEqual(celdaA)
  })

  it('ordena las celdas por celdaEra5 de forma determinista', () => {
    const plan = planificarDescargas(base({ celdas: [celdaC, celdaA, celdaB], anioDesde: 2020 }))

    expect(plan).toHaveLength(1)
    expect(plan[0].celdas.map((celda) => celda.celdaEra5)).toEqual(['A', 'B', 'C'])
  })

  it('omite las celdas-año ya guardadas', () => {
    const plan = planificarDescargas(base({ aniosGuardados: new Set(['A:2020', 'B:2019']) }))

    expect(plan.map((lote) => ({ anio: lote.anio, celdas: lote.celdas.map((c) => c.celdaEra5) }))).toEqual([
      { anio: 2020, celdas: ['B'] },
      { anio: 2019, celdas: ['A'] },
    ])
  })

  it('ningún lote supera el peso máximo por request y cubre todas las celdas faltantes', () => {
    const celdas = Array.from({ length: 40 }, (_, i) => ({
      celdaEra5: `C${String(i).padStart(2, '0')}`,
      lat: 0,
      lon: 0,
    }))
    const plan = planificarDescargas(
      base({ celdas, anioDesde: 2020, anioHasta: 2020, pesoMaximoPorRequest: 480 }),
    )

    for (const lote of plan) {
      expect(lote.peso).toBeLessThanOrEqual(480)
      expect(lote.peso).toBeCloseTo(lote.celdas.length * (366 / 14), 6)
    }
    expect(plan.reduce((total, lote) => total + lote.celdas.length, 0)).toBe(40)
    expect(plan.map((lote) => lote.celdas.length)).toEqual([18, 18, 4])
  })

  it('corta el plan cuando el peso acumulado llegaría al cupo disponible', () => {
    const plan = planificarDescargas(
      base({ celdas: [celdaA, celdaB, celdaC, { celdaEra5: 'D', lat: 0, lon: 0 }, { celdaEra5: 'E', lat: 0, lon: 0 }], anioDesde: 2019, anioHasta: 2019, pesoDisponible: 100 }),
    )

    expect(plan).toHaveLength(1)
    expect(plan[0].anio).toBe(2019)
    expect(plan[0].celdas.map((celda) => celda.celdaEra5)).toEqual(['A', 'B', 'C'])
    expect(plan[0].peso).toBeCloseTo(3 * (365 / 14), 6)
    expect(plan[0].peso).toBeLessThanOrEqual(100)
  })

  it('no entrega requests más allá del cupo aunque haya años más antiguos pendientes', () => {
    const plan = planificarDescargas(base({ pesoDisponible: 26.5 }))

    expect(plan).toHaveLength(1)
    expect(plan[0].anio).toBe(2020)
    expect(plan[0].celdas).toHaveLength(1)
  })

  it('pesa un año bisiesto con 366 días', () => {
    const plan = planificarDescargas(base({ celdas: [celdaA], anioDesde: 2020, anioHasta: 2020 }))

    expect(plan).toHaveLength(1)
    expect(plan[0].peso).toBeCloseTo(366 / 14, 6)
  })

  it('pesa un año no bisiesto con 365 días', () => {
    const plan = planificarDescargas(base({ celdas: [celdaA], anioDesde: 2019, anioHasta: 2019 }))

    expect(plan[0].peso).toBeCloseTo(365 / 14, 6)
  })

  it('devuelve [] cuando no falta nada', () => {
    const plan = planificarDescargas(
      base({ aniosGuardados: new Set(['A:2019', 'A:2020', 'B:2019', 'B:2020']) }),
    )

    expect(plan).toEqual([])
  })

  it('devuelve [] sin celdas, con rango vacío o con cupo menor a una celda-año', () => {
    expect(planificarDescargas(base({ celdas: [] }))).toEqual([])
    expect(planificarDescargas(base({ anioDesde: 2021, anioHasta: 2020 }))).toEqual([])
    expect(planificarDescargas(base({ pesoDisponible: 10 }))).toEqual([])
  })
})
