// Tests de lluvia observada: agregación pura de gránulos IMERG por ámbito,
// clasificación de percentiles y lectores de la base aislada en un tmpdir
// (mismo patrón que repositorio.test.ts).
import { beforeEach, describe, expect, it } from 'vitest'
import { getDb } from '@/lib/db'
import { hazardClimatology, hazardObservation } from '@/lib/db/schema'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import {
  agregarLluviaObservada,
  leerGranulosImerg,
  leerUmbralesLluviaDiaria,
  percentilClimatologico,
  type GranuloLluvia,
} from './lluvia-observada'

usarDbTemporal('veredicto-lluvia-observada')

const CELDA_CAPITAL = '-27.5_-58.8'
const CELDA_MERCEDES = '-29.2_-58.1'
const CELDA_SIN_DEPARTAMENTO = '-30.0_-57.0'

const celdas = new Map<string, string>([
  [CELDA_CAPITAL, 'CAPITAL'],
  [CELDA_MERCEDES, 'MERCEDES'],
])

function granulo(geometryRef: string, hora: string, valor: number): GranuloLluvia {
  return { geometryRef, validoDesde: `2026-10-12T${hora}:00.000Z`, valor }
}

function buscar(
  resultado: ReturnType<typeof agregarLluviaObservada>,
  ambito: string,
): ReturnType<typeof agregarLluviaObservada>[number] {
  const fila = resultado.find((r) => r.ambito === ambito)
  if (!fila) throw new Error(`Falta el ámbito ${ambito}`)
  return fila
}

describe('agregarLluviaObservada', () => {
  it('suma los gránulos por celda y calcula promedio y máximo por ámbito', () => {
    const resultado = agregarLluviaObservada({
      granulos: [
        granulo(CELDA_CAPITAL, '00:00', 1),
        granulo(CELDA_CAPITAL, '00:30', 2),
        granulo(CELDA_MERCEDES, '00:00', 0.5),
        granulo(CELDA_MERCEDES, '00:30', 0.5),
      ],
      celdas,
      dias: 1,
    })

    // Provincia: media de las sumas por celda (3.0 y 1.0).
    const provincia = buscar(resultado, 'provincia')
    expect(provincia.promMm).toBe(2)
    expect(provincia.maxMm).toBe(3)
    expect(provincia.celdaMax).toBe(CELDA_CAPITAL)

    const capital = buscar(resultado, 'departamento:CAPITAL')
    expect(capital.promMm).toBe(3)
    expect(capital.maxMm).toBe(3)
    expect(capital.celdaMax).toBe(CELDA_CAPITAL)
  })

  it('calcula la cobertura como gránulos recibidos sobre 48 × días × celdas del ámbito', () => {
    const resultado = agregarLluviaObservada({
      granulos: [granulo(CELDA_CAPITAL, '00:00', 1), granulo(CELDA_MERCEDES, '00:00', 1)],
      celdas,
      dias: 1,
    })

    const provincia = buscar(resultado, 'provincia')
    expect(provincia.granulosEsperados).toBe(96)
    expect(provincia.granulosRecibidos).toBe(2)
    expect(provincia.cobertura).toBeCloseTo(2 / 96, 10)

    const capital = buscar(resultado, 'departamento:CAPITAL')
    expect(capital.granulosEsperados).toBe(48)
    expect(capital.granulosRecibidos).toBe(1)
    expect(capital.cobertura).toBeCloseTo(1 / 48, 10)
  })

  it('cuenta como cero las celdas del ámbito sin ningún gránulo', () => {
    const resultado = agregarLluviaObservada({
      granulos: [granulo(CELDA_CAPITAL, '00:00', 3)],
      celdas,
      dias: 1,
    })

    // (3.0 + 0.0) / 2 celdas mapeadas.
    expect(buscar(resultado, 'provincia').promMm).toBe(1.5)
    expect(buscar(resultado, 'departamento:MERCEDES').promMm).toBe(0)
    expect(buscar(resultado, 'departamento:MERCEDES').cobertura).toBe(0)
  })

  it('suma tres días y usa 144 gránulos esperados por celda', () => {
    const granulos: GranuloLluvia[] = [
      granulo(CELDA_CAPITAL, '00:00', 4),
      granulo(CELDA_CAPITAL, '12:00', 6),
    ]

    const resultado = agregarLluviaObservada({ granulos, celdas, dias: 3 })

    const capital = buscar(resultado, 'departamento:CAPITAL')
    expect(capital.promMm).toBe(10)
    expect(capital.granulosEsperados).toBe(144)
    expect(capital.cobertura).toBeCloseTo(2 / 144, 10)
  })

  it('ignora gránulos de celdas no mapeadas y repetidos de la misma celda y hora', () => {
    const resultado = agregarLluviaObservada({
      granulos: [
        granulo(CELDA_SIN_DEPARTAMENTO, '00:00', 50),
        granulo(CELDA_CAPITAL, '00:00', 1),
        granulo(CELDA_CAPITAL, '00:00', 1),
      ],
      celdas,
      dias: 1,
    })

    expect(buscar(resultado, 'departamento:CAPITAL').promMm).toBe(1)
    expect(buscar(resultado, 'provincia').maxMm).toBe(1)
    expect(buscar(resultado, 'provincia').granulosRecibidos).toBe(1)
    expect(resultado.some((r) => r.ambito === 'departamento:null')).toBe(false)
  })

  it('redondea promedio y máximo a 1 decimal', () => {
    const resultado = agregarLluviaObservada({
      granulos: [granulo(CELDA_CAPITAL, '00:00', 0.04), granulo(CELDA_CAPITAL, '00:30', 0.04)],
      celdas,
      dias: 1,
    })

    expect(buscar(resultado, 'departamento:CAPITAL').promMm).toBe(0.1)
    expect(buscar(resultado, 'departamento:CAPITAL').maxMm).toBe(0.1)
  })

  it('devuelve provincia primero y luego departamentos ordenados por id', () => {
    const resultado = agregarLluviaObservada({ granulos: [], celdas, dias: 1 })

    expect(resultado.map((r) => r.ambito)).toEqual([
      'provincia',
      'departamento:CAPITAL',
      'departamento:MERCEDES',
    ])
  })

  it('no devuelve ámbitos si no hay celdas mapeadas', () => {
    expect(agregarLluviaObservada({ granulos: [], celdas: new Map(), dias: 1 })).toEqual([])
  })
})

describe('percentilClimatologico', () => {
  const umbrales = { p90: 5, p95: 10, p99: 20 }

  it('clasifica el valor en el mayor percentil alcanzado', () => {
    expect(percentilClimatologico(25, umbrales)).toBe('p99')
    expect(percentilClimatologico(20, umbrales)).toBe('p99')
    expect(percentilClimatologico(12, umbrales)).toBe('p95')
    expect(percentilClimatologico(5, umbrales)).toBe('p90')
    expect(percentilClimatologico(4.9, umbrales)).toBe('bajo_p90')
    expect(percentilClimatologico(0, umbrales)).toBe('bajo_p90')
  })

  it('usa solo los umbrales disponibles', () => {
    expect(percentilClimatologico(12, { p90: 5 })).toBe('p90')
    expect(percentilClimatologico(1, { p90: 5 })).toBe('bajo_p90')
  })

  it('devuelve null sin ningún umbral', () => {
    expect(percentilClimatologico(30, {})).toBeNull()
  })
})

describe('leerGranulosImerg', () => {
  beforeEach(async () => {
    await getDb().delete(hazardObservation)
  })

  function fila(
    overrides: Partial<typeof hazardObservation.$inferInsert>,
  ): typeof hazardObservation.$inferInsert {
    return {
      id: `obs-${Math.random()}`,
      provider: 'nasa-imerg',
      variable: 'precipitacion_observada_satelital',
      geometryRef: CELDA_CAPITAL,
      valor: 1,
      unidad: 'mm/30min',
      observadoEn: '2026-10-12T00:30:00.000Z',
      validoDesde: '2026-10-12T00:00:00.000Z',
      validoHasta: '2026-10-12T00:30:00.000Z',
      ingeridoEn: '2026-10-12T01:00:00.000Z',
      ...overrides,
    }
  }

  it('lee solo gránulos IMERG de la variable con inicio dentro de [desde, hasta)', async () => {
    await getDb().insert(hazardObservation).values([
      fila({ id: 'dentro', observadoEn: '2026-10-12T00:45:00.000Z', validoDesde: '2026-10-12T03:00:00.000Z' }),
      fila({ id: 'antes', observadoEn: '2026-10-12T01:45:00.000Z', validoDesde: '2026-10-12T02:30:00.000Z' }),
      fila({ id: 'hasta-excluido', observadoEn: '2026-10-12T02:45:00.000Z', validoDesde: '2026-10-13T03:00:00.000Z' }),
      fila({ id: 'otra-variable', observadoEn: '2026-10-12T03:45:00.000Z', variable: 'otra', validoDesde: '2026-10-12T04:00:00.000Z' }),
      fila({ id: 'otro-provider', observadoEn: '2026-10-12T04:45:00.000Z', provider: 'otro', validoDesde: '2026-10-12T05:00:00.000Z' }),
    ])

    const granulos = await leerGranulosImerg(
      getDb(),
      '2026-10-12T03:00:00.000Z',
      '2026-10-13T03:00:00.000Z',
    )

    expect(granulos).toEqual([
      {
        geometryRef: CELDA_CAPITAL,
        validoDesde: '2026-10-12T03:00:00.000Z',
        valor: 1,
      },
    ])
  })
})

describe('leerUmbralesLluviaDiaria', () => {
  beforeEach(async () => {
    await getDb().delete(hazardClimatology)
  })

  function umbral(
    overrides: Partial<typeof hazardClimatology.$inferInsert>,
  ): typeof hazardClimatology.$inferInsert {
    return {
      id: `clim-${Math.random()}`,
      geometryRef: CELDA_CAPITAL,
      variable: 'precipitacion_diaria',
      percentil: 'p90',
      muestra: 'dias_humedos',
      valor: 10,
      unidad: 'mm',
      periodoDesde: '1990-01-01',
      periodoHasta: '2020-12-31',
      version: 'v1',
      calculadoEn: '2026-01-01T00:00:00.000Z',
      ...overrides,
    }
  }

  it('devuelve los percentiles de días húmedos de la versión más reciente', async () => {
    await getDb()
      .insert(hazardClimatology)
      .values([
        umbral({ id: 'p90-v1', valor: 8, version: 'v1', periodoHasta: '2020-12-31' }),
        umbral({ id: 'p90-v2', valor: 9, version: 'v2', periodoHasta: '2024-12-31' }),
        umbral({ id: 'p95-v2', percentil: 'p95', valor: 15, version: 'v2', periodoHasta: '2024-12-31' }),
        umbral({ id: 'p99-v2', percentil: 'p99', valor: 30, version: 'v2', periodoHasta: '2024-12-31' }),
        umbral({ id: 'todos', muestra: 'todos_los_dias', valor: 0, version: 'v2', periodoHasta: '2024-12-31' }),
        umbral({ id: 'otra-celda', geometryRef: CELDA_MERCEDES, valor: 99, version: 'v2', periodoHasta: '2024-12-31' }),
      ])

    const umbrales = await leerUmbralesLluviaDiaria(getDb(), CELDA_CAPITAL)

    expect(umbrales).toEqual({ p90: 9, p95: 15, p99: 30 })
  })

  it('devuelve un objeto vacío si la celda no tiene climatología', async () => {
    expect(await leerUmbralesLluviaDiaria(getDb(), CELDA_SIN_DEPARTAMENTO)).toEqual({})
  })
})
