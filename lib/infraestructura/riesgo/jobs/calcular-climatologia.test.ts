import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ejecutarCalculoClimatologia as EjecutarCalculoClimatologia } from './calcular-climatologia'
import type { obtenerSerieHistorica as ObtenerSerieHistorica } from '../providers/climatologia'

let dir: string
let prevDataDir: string | undefined

let ejecutarCalculoClimatologia: typeof EjecutarCalculoClimatologia

// Dos celdas distintas, con coordenadas distintas para que el fake pueda
// discriminar cuál falla (lat 1 → falla, lat 2 → ok).
const CELDA_A = '-27.4_-58.8'
const CELDA_B = '-27.5_-58.9'

// Serie sintética conocida: 10 días secos (0 mm) + 10 días húmedos
// {1..9, 100}. Produce 3 filas de `todos_los_dias` + 3 de `dias_humedos` = 6
// por celda (ver climatologia.test.ts).
const SERIE_SINTETICA = [3, 0, 100, 5, 0, 1, 0, 8, 2, 0, 9, 0, 4, 0, 6, 0, 7, 0, 0, 0]

function serieOkFake(): typeof ObtenerSerieHistorica {
  return async () => ({ ok: true, valoresDiarios: SERIE_SINTETICA })
}

function serieConCeldaCaidaFake(): typeof ObtenerSerieHistorica {
  return async ({ lat }) => {
    if (lat === 1) {
      return { ok: false, motivo: 'sin_datos', detalle: 'fake: celda caída' }
    }
    return { ok: true, valoresDiarios: SERIE_SINTETICA }
  }
}

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'calcular-climatologia-'))
  prevDataDir = process.env.DATA_DIR
  process.env.DATA_DIR = dir

  const { ensureSeeded } = await import('@/lib/db/seed')
  await ensureSeeded()
  ;({ ejecutarCalculoClimatologia } = await import('./calcular-climatologia'))

  const { getDb } = await import('@/lib/db')
  const { infraGeoProfile } = await import('@/lib/db/schema')
  await getDb()
    .insert(infraGeoProfile)
    .values([
      {
        cueAnexo: '1800001-00',
        geometryRef: CELDA_A,
        lat: 1,
        lon: 1,
        motivoExclusion: null,
        perfilVersion: 'geo-perfil-v1',
        calculadoEn: '2026-09-26T00:00:00.000Z',
      },
      {
        cueAnexo: '1800002-00',
        geometryRef: CELDA_B,
        lat: 2,
        lon: 2,
        motivoExclusion: null,
        perfilVersion: 'geo-perfil-v1',
        calculadoEn: '2026-09-26T00:00:00.000Z',
      },
    ])
})

afterAll(() => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  rmSync(dir, { recursive: true, force: true })
})

describe('ejecutarCalculoClimatologia', () => {
  it('primera corrida inserta 6 filas por celda (2 celdas × 6)', async () => {
    const resultado = await ejecutarCalculoClimatologia({ obtenerSerie: serieOkFake() })

    expect(resultado).toEqual({
      ok: true,
      resultado: {
        celdasProcesadas: 2,
        filasInsertadas: 12,
        celdasConError: [],
      },
    })

    const { getDb } = await import('@/lib/db')
    const { hazardClimatology } = await import('@/lib/db/schema')
    const filas = await getDb().select().from(hazardClimatology)
    expect(filas).toHaveLength(12)
  })

  it('repetir la misma corrida (mismo período/versión) no adquiere lease y no duplica filas', async () => {
    const { getDb } = await import('@/lib/db')
    const { hazardClimatology } = await import('@/lib/db/schema')
    const db = getDb()

    const antes = await db.select().from(hazardClimatology)
    expect(antes).toHaveLength(12)

    const resultado = await ejecutarCalculoClimatologia({ obtenerSerie: serieOkFake() })
    expect(resultado).toEqual({ ok: false, motivo: 'lease_no_disponible' })

    const despues = await db.select().from(hazardClimatology)
    expect(despues).toHaveLength(12)
  })

  it('una celda con error queda en celdasConError pero el job completa ok y procesa la otra', async () => {
    const resultado = await ejecutarCalculoClimatologia({
      periodoDesde: '1981-01-01',
      periodoHasta: '2010-12-31',
      version: 'climatologia-v2',
      obtenerSerie: serieConCeldaCaidaFake(),
    })

    expect(resultado).toEqual({
      ok: true,
      resultado: {
        celdasProcesadas: 1,
        filasInsertadas: 6,
        celdasConError: [CELDA_A],
      },
    })

    const { getDb } = await import('@/lib/db')
    const { hazardClimatology } = await import('@/lib/db/schema')
    const filas = await getDb().select().from(hazardClimatology)
    // 12 de la versión v1 + 6 de la v2 (sólo la celda que respondió ok)
    expect(filas).toHaveLength(18)
  })
})
