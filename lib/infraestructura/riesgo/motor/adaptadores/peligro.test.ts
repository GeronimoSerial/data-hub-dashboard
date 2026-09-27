// Tests del adapter real de PuertoPeligro. A diferencia del viejo stub, este
// adapter delega en peligro/nivel.ts (E3a), que lee de la DB. Por eso el
// patrón es el mismo que nivel.test.ts: DATA_DIR temporal + ensureSeeded y
// borrado de las tablas hazard_* entre tests. Nunca se golpea la red.
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { hazardClimatology, hazardEnsembleProb, hazardForecast } from '@/lib/db/schema'
import type { getDb as GetDb } from '@/lib/db'
import type { NivelCaudalPunto, NivelPeligroCelda } from '../puertos'
import type { crearAdapterPeligro as CrearAdapterPeligro } from './peligro'

const AS_OF = '2026-09-26T12:00:00.000Z'
const CORRIDA = '2026-09-26T00:00:00.000Z'
const GEOM = 'geom-1'
const PUNTO = 'punto-1'

let dir: string
let prevDataDir: string | undefined

let db: ReturnType<typeof GetDb>
let crearAdapterPeligro: typeof CrearAdapterPeligro

function filaEnsemble(params: {
  geometryRef: string
  horizonteHoras: number
  validoEn: string
  probabilidadP95: number
  probabilidadP99: number
}): typeof hazardEnsembleProb.$inferInsert {
  return {
    id: randomUUID(),
    variable: 'precipitacion_24h',
    corridaEn: CORRIDA,
    miembrosTotal: 51,
    miembrosValidos: 51,
    dispersion: 0,
    version: 'ensemble-v1',
    ingeridoEn: CORRIDA,
    ...params,
  }
}

function filaPronostico(params: {
  geometryRef: string
  variable: 'precipitacion' | 'caudal'
  horizonteHoras: number
  validoEn: string
  valor: number
}): typeof hazardForecast.$inferInsert {
  return {
    id: randomUUID(),
    provider: 'test',
    unidad: params.variable === 'caudal' ? 'm3/s' : 'mm',
    pasoHoras: 1,
    rawRef: null,
    corridaEn: CORRIDA,
    ingeridoEn: CORRIDA,
    ...params,
  }
}

function filaClimatologia(params: {
  geometryRef: string
  variable: 'precipitacion_diaria' | 'caudal_diario'
  percentil: 'p90' | 'p95' | 'p99'
  valor: number
}): typeof hazardClimatology.$inferInsert {
  return {
    id: randomUUID(),
    muestra: 'todos_los_dias',
    unidad: 'mm',
    periodoDesde: '1991-01-01',
    periodoHasta: '2020-12-31',
    version: 'climatologia-v1',
    calculadoEn: CORRIDA,
    ...params,
  }
}

async function insertarClimatologia(
  geometryRef: string,
  variable: 'precipitacion_diaria' | 'caudal_diario',
  valores: { p90: number; p95: number; p99: number },
): Promise<void> {
  await db.insert(hazardClimatology).values([
    filaClimatologia({ geometryRef, variable, percentil: 'p90', valor: valores.p90 }),
    filaClimatologia({ geometryRef, variable, percentil: 'p95', valor: valores.p95 }),
    filaClimatologia({ geometryRef, variable, percentil: 'p99', valor: valores.p99 }),
  ])
}

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'adapter-peligro-'))
  prevDataDir = process.env.DATA_DIR
  process.env.DATA_DIR = dir

  const { ensureSeeded } = await import('@/lib/db/seed')
  await ensureSeeded()

  const { getDb } = await import('@/lib/db')
  db = getDb()
  ;({ crearAdapterPeligro } = await import('./peligro'))
})

afterAll(() => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  rmSync(dir, { recursive: true, force: true })
})

beforeEach(async () => {
  await db.delete(hazardEnsembleProb)
  await db.delete(hazardForecast)
  await db.delete(hazardClimatology)
})

describe('crearAdapterPeligro.obtenerNivelesCelda', () => {
  it('con datos reales mapea las filas de los horizontes pedidos', async () => {
    await db.insert(hazardEnsembleProb).values([
      filaEnsemble({
        geometryRef: GEOM,
        horizonteHoras: 24,
        validoEn: '2026-09-26T23:00:00.000Z',
        probabilidadP95: 0.6,
        probabilidadP99: 0.1,
      }),
      filaEnsemble({
        geometryRef: GEOM,
        horizonteHoras: 72,
        validoEn: '2026-09-29T00:00:00.000Z',
        probabilidadP95: 0.05,
        probabilidadP99: 0.9,
      }),
    ])

    const filas = await crearAdapterPeligro().obtenerNivelesCelda({
      geometryRef: GEOM,
      horizontes: [24, 72],
      asOf: AS_OF,
    })

    const esperadas: NivelPeligroCelda[] = [
      {
        geometryRef: GEOM,
        horizonteHoras: 24,
        nivel: 'naranja',
        base: 'ensemble',
        probabilidadP95: 0.6,
        probabilidadP99: 0.1,
        precipitacionMm: null,
        percentilReferencia: 'P95',
        emitidoEn: CORRIDA,
        validoHasta: '2026-09-26T23:00:00.000Z',
        versionRegla: 'peligro-v0.1',
      },
      {
        geometryRef: GEOM,
        horizonteHoras: 72,
        nivel: 'rojo',
        base: 'ensemble',
        probabilidadP95: 0.05,
        probabilidadP99: 0.9,
        precipitacionMm: null,
        percentilReferencia: 'P99',
        emitidoEn: CORRIDA,
        validoHasta: '2026-09-29T00:00:00.000Z',
        versionRegla: 'peligro-v0.1',
      },
    ]

    expect(filas).toEqual(esperadas)
  })

  it('sin datos para una celda/horizonte devuelve sin_dato (nunca verde ni el string del stub viejo)', async () => {
    const filas = await crearAdapterPeligro().obtenerNivelesCelda({
      geometryRef: 'geom-sin-datos',
      horizontes: [24],
      asOf: AS_OF,
    })

    expect(filas).toEqual([
      {
        geometryRef: 'geom-sin-datos',
        horizonteHoras: 24,
        nivel: 'sin_dato',
        base: 'sin_dato',
        probabilidadP95: null,
        probabilidadP99: null,
        precipitacionMm: null,
        percentilReferencia: null,
        emitidoEn: AS_OF,
        validoHasta: AS_OF,
        versionRegla: 'peligro-v0.1',
      },
    ])
    expect(filas[0].versionRegla).not.toBe('peligro-no-disponible-v0')
  })
})

describe('crearAdapterPeligro.obtenerNivelCaudal', () => {
  it('con pronóstico y climatología devuelve la fila mapeada', async () => {
    await insertarClimatologia(PUNTO, 'caudal_diario', { p90: 50, p95: 100, p99: 140 })
    await db.insert(hazardForecast).values(
      filaPronostico({
        geometryRef: PUNTO,
        variable: 'caudal',
        horizonteHoras: 6,
        validoEn: '2026-09-26T06:00:00.000Z',
        valor: 150,
      }),
    )

    const fila = await crearAdapterPeligro().obtenerNivelCaudal({ puntoId: PUNTO, asOf: AS_OF })

    const esperada: NivelCaudalPunto = {
      puntoId: PUNTO,
      percentilActual: 99,
      nivel: 'rojo',
      emitidoEn: CORRIDA,
      validoHasta: '2026-09-26T06:00:00.000Z',
    }
    expect(fila).toEqual(esperada)
  })

  it('con un puntoId sin datos devuelve null (la ausencia es el objeto entero)', async () => {
    const fila = await crearAdapterPeligro().obtenerNivelCaudal({
      puntoId: 'punto-inexistente',
      asOf: AS_OF,
    })

    expect(fila).toBeNull()
  })
})
