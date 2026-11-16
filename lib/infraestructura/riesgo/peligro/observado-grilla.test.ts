import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb, migrarDb } from '@/lib/db'
import { hazardObservation } from '@/lib/db/schema'
import { celdaAPoligono, obtenerGrillaObservada } from './observado-grilla'
import { PROVIDER_OBSERVADO, VARIABLE_OBSERVADA } from './observado'

// seed: false: las migraciones se aplican explícitamente abajo.
usarDbTemporal('observado-grilla-', { seed: false })

const HASTA = '2026-10-13T12:00:00.000Z'
const CELDA_A = '-27.4_-58.8'
const CELDA_B = '-27.5_-58.9'

beforeAll(async () => {
  await migrarDb()
})

beforeEach(async () => {
  await getDb().delete(hazardObservation)
})

function instante(desdeIso: string, minutosAtras: number) {
  return new Date(Date.parse(desdeIso) - minutosAtras * 60_000).toISOString()
}

function granulo(geometryRef: string, observadoEn: string, valor: number, provider = PROVIDER_OBSERVADO) {
  return {
    id: `${geometryRef}-${observadoEn}-${provider}`,
    provider,
    variable: VARIABLE_OBSERVADA,
    geometryRef,
    valor,
    unidad: 'mm',
    observadoEn,
    validoDesde: observadoEn,
    validoHasta: observadoEn,
    calidad: null as number | null,
    rawRef: null,
    ingeridoEn: '2026-10-13T12:05:00.000Z',
  }
}

async function insertar(filas: ReturnType<typeof granulo>[]) {
  if (filas.length > 0) await getDb().insert(hazardObservation).values(filas)
}

describe('celdaAPoligono', () => {
  it('convierte la celda en un polígono cuadrado de ±0.05° alrededor del centro', () => {
    const poligono = celdaAPoligono(CELDA_A)
    expect(poligono).toEqual({
      type: 'Polygon',
      coordinates: [
        [
          [-58.85, -27.45],
          [-58.75, -27.45],
          [-58.75, -27.35],
          [-58.85, -27.35],
          [-58.85, -27.45],
        ],
      ],
    })
  })

  it('devuelve null para un geometryRef no parseable', () => {
    expect(celdaAPoligono('basura')).toBeNull()
    expect(celdaAPoligono('')).toBeNull()
    expect(celdaAPoligono('-27.4_')).toBeNull()
  })
})

describe('obtenerGrillaObservada', () => {
  it('devuelve celdas vacías y hasta nulo si no hay observaciones', async () => {
    const grilla = await obtenerGrillaObservada(getDb(), 24)
    expect(grilla).toEqual({ hasta: null, desde: null, celdas: [] })
  })

  it('suma la ventana completa de 24 h con cobertura total', async () => {
    // 48 gránulos de 0.5 mm cada 30 min: la ventana (desde, hasta] los incluye todos.
    const filas = Array.from({ length: 48 }, (_, k) => granulo(CELDA_A, instante(HASTA, k * 30), 0.5))
    await insertar(filas)

    const grilla = await obtenerGrillaObservada(getDb(), 24)
    expect(grilla.hasta).toBe(HASTA)
    expect(grilla.desde).toBe('2026-10-12T12:00:00.000Z')
    expect(grilla.celdas).toEqual([
      {
        geometryRef: CELDA_A,
        acumuladoMm: 24,
        granulos: 48,
        esperados: 48,
        cobertura: 1,
        parcial: false,
        calidadPonderada: null,
        confianza: 'alta',
      },
    ])
  })

  it('marca confianza baja si la lluvia viene de gránulos de calidad baja, sin cambiar el acumulado', async () => {
    const filas = Array.from({ length: 48 }, (_, k) => ({
      ...granulo(CELDA_A, instante(HASTA, k * 30), 0.5),
      calidad: k % 2 === 0 ? 0.33 : 0.5,
    }))
    await insertar(filas)

    const [celda] = (await obtenerGrillaObservada(getDb(), 24)).celdas
    expect(celda.acumuladoMm).toBe(24)
    expect(celda.confianza).toBe('baja')
    expect(celda.calidadPonderada).toBeCloseTo(0.415, 3)
  })

  it('con calidad alta la confianza es alta; la calidad null no la baja', async () => {
    await insertar([
      ...Array.from({ length: 48 }, (_, k) => ({ ...granulo(CELDA_A, instante(HASTA, k * 30), 0.5), calidad: 0.7 })),
      ...Array.from({ length: 48 }, (_, k) => granulo(CELDA_B, instante(HASTA, k * 30), 0.5)),
    ])

    const celdas = (await obtenerGrillaObservada(getDb(), 24)).celdas
    expect(celdas.find((c) => c.geometryRef === CELDA_A)?.confianza).toBe('alta')
    expect(celdas.find((c) => c.geometryRef === CELDA_B)).toMatchObject({ confianza: 'alta', calidadPonderada: null })
  })

  it('marca como parcial una celda con pocos gránulos y reporta igual su suma', async () => {
    const filas = Array.from({ length: 10 }, (_, k) => granulo(CELDA_B, instante(HASTA, k * 30), 1))
    await insertar(filas)

    const [celda] = (await obtenerGrillaObservada(getDb(), 24)).celdas
    expect(celda).toMatchObject({
      geometryRef: CELDA_B,
      acumuladoMm: 10,
      granulos: 10,
      esperados: 48,
      parcial: true,
    })
    expect(celda.cobertura).toBeCloseTo(10 / 48)
  })

  it('excluye observaciones anteriores a la ventana y de otro proveedor', async () => {
    await insertar([
      granulo(CELDA_A, instante(HASTA, 0), 2),
      granulo(CELDA_A, instante(HASTA, 25 * 60), 99),
      granulo(CELDA_B, instante(HASTA, 0), 7, 'otro-proveedor'),
    ])

    const grilla = await obtenerGrillaObservada(getDb(), 24)
    expect(grilla.celdas.map((c) => c.geometryRef)).toEqual([CELDA_A])
    expect(grilla.celdas[0].acumuladoMm).toBe(2)
  })
})
