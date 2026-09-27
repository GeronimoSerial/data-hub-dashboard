import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ejecutarCalculoClimatologiaCaudal as EjecutarCalculoClimatologiaCaudal } from './calcular-climatologia-caudal'
import type { obtenerSeriesHistoricasCaudal as ObtenerSeriesHistoricasCaudal } from '../providers/climatologia-caudal'
import { PUNTOS_RIO } from '../puntos-rio'

let dir: string
let prevDataDir: string | undefined

let ejecutarCalculoClimatologiaCaudal: typeof EjecutarCalculoClimatologiaCaudal

// Serie sintética conocida: 10 días con caudal 0 + 10 días con caudal
// {1..9, 100}. Produce 3 filas de `todos_los_dias` por punto (ver
// climatologia-caudal.test.ts).
const SERIE_SINTETICA = [3, 0, 100, 5, 0, 1, 0, 8, 2, 0, 9, 0, 4, 0, 6, 0, 7, 0, 0, 0]

const PUNTO_CAIDO = PUNTOS_RIO[0].id

function seriesOkFake(): typeof ObtenerSeriesHistoricasCaudal {
  return async ({ puntos }) => {
    const seriesPorPunto: Record<string, number[]> = {}
    for (const punto of puntos) {
      seriesPorPunto[punto.id] = SERIE_SINTETICA
    }
    return { seriesPorPunto, erroresPorPunto: {} }
  }
}

function seriesConPuntoCaidoFake(): typeof ObtenerSeriesHistoricasCaudal {
  return async ({ puntos }) => {
    const seriesPorPunto: Record<string, number[]> = {}
    const erroresPorPunto: Record<string, { motivo: string; detalle: string }> = {}
    for (const punto of puntos) {
      if (punto.id === PUNTO_CAIDO) {
        erroresPorPunto[punto.id] = { motivo: 'sin_datos', detalle: 'fake: punto caído' }
        continue
      }
      seriesPorPunto[punto.id] = SERIE_SINTETICA
    }
    return { seriesPorPunto, erroresPorPunto }
  }
}

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'calcular-climatologia-caudal-'))
  prevDataDir = process.env.DATA_DIR
  process.env.DATA_DIR = dir

  const { ensureSeeded } = await import('@/lib/db/seed')
  await ensureSeeded()
  ;({ ejecutarCalculoClimatologiaCaudal } = await import('./calcular-climatologia-caudal'))
})

afterAll(() => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  rmSync(dir, { recursive: true, force: true })
})

describe('ejecutarCalculoClimatologiaCaudal', () => {
  it('primera corrida inserta 3 filas por punto para los 8 puntos de PUNTOS_RIO', async () => {
    const resultado = await ejecutarCalculoClimatologiaCaudal({ obtenerSeries: seriesOkFake() })

    expect(resultado).toEqual({
      ok: true,
      resultado: {
        puntosProcesados: PUNTOS_RIO.length,
        filasInsertadas: PUNTOS_RIO.length * 3,
        puntosConError: [],
      },
    })

    const { getDb } = await import('@/lib/db')
    const { hazardClimatology } = await import('@/lib/db/schema')
    const filas = await getDb().select().from(hazardClimatology)
    expect(filas).toHaveLength(PUNTOS_RIO.length * 3)

    const refs = new Set(filas.map((fila) => fila.geometryRef))
    for (const punto of PUNTOS_RIO) {
      expect(refs.has(punto.id)).toBe(true)
    }
    expect(filas.every((fila) => fila.variable === 'caudal_diario')).toBe(true)
    expect(filas.every((fila) => fila.muestra === 'todos_los_dias')).toBe(true)
  })

  it('repetir la misma corrida (mismo período/versión) no adquiere lease y no duplica filas', async () => {
    const { getDb } = await import('@/lib/db')
    const { hazardClimatology } = await import('@/lib/db/schema')
    const db = getDb()

    const antes = await db.select().from(hazardClimatology)
    expect(antes).toHaveLength(PUNTOS_RIO.length * 3)

    const resultado = await ejecutarCalculoClimatologiaCaudal({ obtenerSeries: seriesOkFake() })
    expect(resultado).toEqual({ ok: false, motivo: 'lease_no_disponible' })

    const despues = await db.select().from(hazardClimatology)
    expect(despues).toHaveLength(PUNTOS_RIO.length * 3)
  })

  it('un punto con error no bloquea a los demás ni tumba el job', async () => {
    const resultado = await ejecutarCalculoClimatologiaCaudal({
      periodoDesde: '2014-01-01',
      periodoHasta: '2023-12-31',
      version: 'caudal-climatologia-v0.2',
      obtenerSeries: seriesConPuntoCaidoFake(),
    })

    expect(resultado).toEqual({
      ok: true,
      resultado: {
        puntosProcesados: PUNTOS_RIO.length - 1,
        filasInsertadas: (PUNTOS_RIO.length - 1) * 3,
        puntosConError: [PUNTO_CAIDO],
      },
    })

    const { getDb } = await import('@/lib/db')
    const { hazardClimatology } = await import('@/lib/db/schema')
    const filas = await getDb().select().from(hazardClimatology)
    // 24 de la versión v0.1 + 21 de la v0.2 (sólo los puntos que respondieron ok)
    expect(filas).toHaveLength(PUNTOS_RIO.length * 3 + (PUNTOS_RIO.length - 1) * 3)
  })

  // Regresión: antes del fix, una excepción posterior a adquirir el lease
  // (no un error por punto reportado por el provider, sino un throw real)
  // escapaba sin publicar resultado y `infra_job_run` quedaba 'en_progreso'
  // hasta el vencimiento del lease.
  it('si obtenerSeries lanza, el job-run queda fallido y la excepción se relanza', async () => {
    const errorOriginal = new Error('boom: fallo simulado de red')
    const obtenerSeries: typeof ObtenerSeriesHistoricasCaudal = async () => {
      throw errorOriginal
    }

    await expect(
      ejecutarCalculoClimatologiaCaudal({
        periodoDesde: '2000-01-01',
        periodoHasta: '2009-12-31',
        version: 'caudal-climatologia-v0.3-fallido',
        obtenerSeries,
      }),
    ).rejects.toThrow(errorOriginal)

    const { getDb } = await import('@/lib/db')
    const { infraJobRun } = await import('@/lib/db/schema')
    const { eq } = await import('drizzle-orm')
    const [fila] = await getDb()
      .select()
      .from(infraJobRun)
      .where(
        eq(infraJobRun.claveIdempotente, '2000-01-01_2009-12-31_caudal-climatologia-v0.3-fallido'),
      )

    expect(fila?.estado).toBe('fallido')
    expect(fila?.leaseOwner).toBeNull()
  })
})
