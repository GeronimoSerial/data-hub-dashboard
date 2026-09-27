import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { ejecutarCalculoClimatologia as EjecutarCalculoClimatologia } from './calcular-climatologia'
import type {
  obtenerSeriesHistoricas as ObtenerSeriesHistoricas,
  ResultadoSeriesHistoricas,
} from '../providers/climatologia'

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

function resultadoBase(): Omit<ResultadoSeriesHistoricas, 'seriesPorCelda' | 'erroresPorCelda'> {
  return { llamadasRealizadas: 1, celdasPorLlamada: [], puntosOriginales: 0, celdasEra5Unicas: 0 }
}

// Fake batch: todas las celdas pedidas responden ok con la misma serie
// sintética (mismo shape que devolvería `obtenerSeriesHistoricas` real tras
// deduplicar por celda ERA5 y volver a expandir a cada geometryRef).
function serieOkFake(): typeof ObtenerSeriesHistoricas {
  return async ({ puntos }) => {
    const seriesPorCelda: Record<string, number[]> = {}
    for (const punto of puntos) seriesPorCelda[punto.geometryRef] = SERIE_SINTETICA
    return { ...resultadoBase(), seriesPorCelda, erroresPorCelda: {} }
  }
}

// Fake batch: la celda con lat === 1 (CELDA_A) cae en erroresPorCelda; el
// resto responde ok.
function serieConCeldaCaidaFake(): typeof ObtenerSeriesHistoricas {
  return async ({ puntos }) => {
    const seriesPorCelda: Record<string, number[]> = {}
    const erroresPorCelda: Record<string, { motivo: string; detalle: string }> = {}
    for (const punto of puntos) {
      if (punto.lat === 1) {
        erroresPorCelda[punto.geometryRef] = { motivo: 'sin_datos', detalle: 'fake: celda caída' }
      } else {
        seriesPorCelda[punto.geometryRef] = SERIE_SINTETICA
      }
    }
    return { ...resultadoBase(), seriesPorCelda, erroresPorCelda }
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
    const resultado = await ejecutarCalculoClimatologia({ obtenerSeries: serieOkFake() })

    expect(resultado).toEqual({
      ok: true,
      resultado: {
        celdasProcesadas: 2,
        filasInsertadas: 12,
        celdasConError: [],
        cortadoPorCupo: false,
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

    const resultado = await ejecutarCalculoClimatologia({ obtenerSeries: serieOkFake() })
    expect(resultado).toEqual({ ok: false, motivo: 'lease_no_disponible' })

    const despues = await db.select().from(hazardClimatology)
    expect(despues).toHaveLength(12)
  })

  it('una celda con error queda en celdasConError pero el job completa ok y procesa la otra', async () => {
    const resultado = await ejecutarCalculoClimatologia({
      periodoDesde: '1981-01-01',
      periodoHasta: '2010-12-31',
      version: 'climatologia-v2',
      obtenerSeries: serieConCeldaCaidaFake(),
    })

    expect(resultado).toEqual({
      ok: true,
      resultado: {
        celdasProcesadas: 1,
        filasInsertadas: 6,
        celdasConError: [CELDA_A],
        cortadoPorCupo: false,
      },
    })

    const { getDb } = await import('@/lib/db')
    const { hazardClimatology } = await import('@/lib/db/schema')
    const filas = await getDb().select().from(hazardClimatology)
    // 12 de la versión v1 + 6 de la v2 (sólo la celda que respondió ok)
    expect(filas).toHaveLength(18)
  })

  // Regresión: antes del fix, una excepción posterior a adquirir el lease
  // (no un `{ ok: false }` reportado por el provider, sino un throw real)
  // escapaba sin publicar resultado y `infra_job_run` quedaba 'en_progreso'
  // hasta el vencimiento del lease.
  it('si obtenerSeries lanza, el job-run queda fallido y la excepción se relanza', async () => {
    const errorOriginal = new Error('boom: fallo simulado de red')
    const obtenerSeries: typeof ObtenerSeriesHistoricas = async () => {
      throw errorOriginal
    }

    await expect(
      ejecutarCalculoClimatologia({
        periodoDesde: '1971-01-01',
        periodoHasta: '2000-12-31',
        version: 'climatologia-v3-fallido',
        obtenerSeries,
      }),
    ).rejects.toThrow(errorOriginal)

    const { getDb } = await import('@/lib/db')
    const { infraJobRun } = await import('@/lib/db/schema')
    const { eq } = await import('drizzle-orm')
    const [fila] = await getDb()
      .select()
      .from(infraJobRun)
      .where(eq(infraJobRun.claveIdempotente, '1971-01-01_2000-12-31_climatologia-v3-fallido'))

    expect(fila?.estado).toBe('fallido')
    expect(fila?.leaseOwner).toBeNull()
  })

  // Regresión del bloqueante de la 2da revisión (OM-cupo): antes del fix,
  // `cupo_minuto_agotado` NO estaba en `MOTIVOS_CUPO_SIN_RED` (ver
  // providers/cupo-om.ts), así que `cortadoPorCupo` quedaba `false` y el
  // job-run se marcaba `completado` con 0 filas — `adquirirLease` bloqueaba
  // cualquier reintento del mismo período+version para siempre. Con el fix,
  // `cupo_minuto_agotado` corta igual que `cupo_agotado`/`host_en_cooldown`.
  it('cupo_minuto_agotado también corta el job-run como fallido (nunca completado con 0 filas)', async () => {
    const obtenerSeries: typeof ObtenerSeriesHistoricas = async ({ puntos }) => {
      const erroresPorCelda: Record<string, { motivo: string; detalle: string }> = {}
      for (const punto of puntos) {
        erroresPorCelda[punto.geometryRef] = { motivo: 'cupo_minuto_agotado', detalle: 'fake: minuto agotado' }
      }
      return { ...resultadoBase(), seriesPorCelda: {}, erroresPorCelda }
    }

    const resultado = await ejecutarCalculoClimatologia({
      periodoDesde: '1951-01-01',
      periodoHasta: '1980-12-31',
      version: 'climatologia-v6-minuto-agotado',
      obtenerSeries,
    })

    expect(resultado).toEqual({
      ok: true,
      resultado: {
        celdasProcesadas: 0,
        filasInsertadas: 0,
        celdasConError: [CELDA_A, CELDA_B],
        cortadoPorCupo: true,
      },
    })

    const { getDb } = await import('@/lib/db')
    const { infraJobRun } = await import('@/lib/db/schema')
    const { eq } = await import('drizzle-orm')
    const [jobRun] = await getDb()
      .select()
      .from(infraJobRun)
      .where(eq(infraJobRun.claveIdempotente, '1951-01-01_1980-12-31_climatologia-v6-minuto-agotado'))

    expect(jobRun?.estado).toBe('fallido')
  })

  // Cursor resumable (OM-cupo): una corrida cortada por `cupo_agotado` no
  // debe recomputar en la corrida siguiente las celdas que ya quedaron
  // persistidas en `hazard_climatology`.
  describe('cursor resumable', () => {
    const PERIODO_DESDE = '1961-01-01'
    const PERIODO_HASTA = '1990-12-31'
    const VERSION = 'climatologia-v4-resumable'

    it('corta en cupo_agotado y no persiste la celda que no llegó a procesarse', async () => {
      // CELDA_A (lat=1) responde ok; CELDA_B (lat=2) simula que el batch
      // completo se cortó por cupo agotado (ambas quedan sin serie: el
      // provider real marca TODO el resto del loop de lotes con el mismo
      // motivo cuando se agota una ventana larga).
      const obtenerSeries: typeof ObtenerSeriesHistoricas = async ({ puntos }) => {
        const seriesPorCelda: Record<string, number[]> = {}
        const erroresPorCelda: Record<string, { motivo: string; detalle: string }> = {}
        for (const punto of puntos) {
          if (punto.geometryRef === CELDA_B) {
            erroresPorCelda[punto.geometryRef] = { motivo: 'cupo_agotado', detalle: 'fake: cupo agotado' }
          } else {
            seriesPorCelda[punto.geometryRef] = SERIE_SINTETICA
          }
        }
        return { ...resultadoBase(), seriesPorCelda, erroresPorCelda }
      }

      const resultado = await ejecutarCalculoClimatologia({
        periodoDesde: PERIODO_DESDE,
        periodoHasta: PERIODO_HASTA,
        version: VERSION,
        obtenerSeries,
      })

      expect(resultado).toEqual({
        ok: true,
        resultado: { celdasProcesadas: 1, filasInsertadas: 6, celdasConError: [CELDA_B], cortadoPorCupo: true },
      })

      const { getDb } = await import('@/lib/db')
      const { hazardClimatology, infraJobRun } = await import('@/lib/db/schema')
      const { and, eq } = await import('drizzle-orm')
      const db = getDb()

      const filasCeldaB = await db
        .select()
        .from(hazardClimatology)
        .where(and(eq(hazardClimatology.geometryRef, CELDA_B), eq(hazardClimatology.version, VERSION)))
      expect(filasCeldaB).toHaveLength(0)

      // El job-run queda 'fallido' A PROPÓSITO (no 'completado'): es lo que
      // permite que `adquirirLease` autorice retomar el MISMO período+version
      // en la siguiente corrida (ver comentario en calcular-climatologia.ts).
      const [jobRun] = await db
        .select()
        .from(infraJobRun)
        .where(eq(infraJobRun.claveIdempotente, `${PERIODO_DESDE}_${PERIODO_HASTA}_${VERSION}`))
      expect(jobRun?.estado).toBe('fallido')
    })

    it('la corrida siguiente (mismo período/versión) sólo pide la celda pendiente, no recomputa la ya hecha', async () => {
      const obtenerSeries = vi.fn<typeof ObtenerSeriesHistoricas>(async ({ puntos }) => {
        const seriesPorCelda: Record<string, number[]> = {}
        for (const punto of puntos) seriesPorCelda[punto.geometryRef] = SERIE_SINTETICA
        return { ...resultadoBase(), seriesPorCelda, erroresPorCelda: {} }
      })

      const resultado = await ejecutarCalculoClimatologia({
        periodoDesde: PERIODO_DESDE,
        periodoHasta: PERIODO_HASTA,
        version: VERSION,
        obtenerSeries,
      })

      // celdasProcesadas cuenta también la que ya venía calculada (CELDA_A);
      // sólo se le pidió red a la pendiente (CELDA_B).
      expect(resultado).toEqual({
        ok: true,
        resultado: { celdasProcesadas: 2, filasInsertadas: 6, celdasConError: [], cortadoPorCupo: false },
      })

      expect(obtenerSeries).toHaveBeenCalledTimes(1)
      const puntosPedidos = obtenerSeries.mock.calls[0][0].puntos
      expect(puntosPedidos.map((p) => p.geometryRef)).toEqual([CELDA_B])

      const { getDb } = await import('@/lib/db')
      const { hazardClimatology } = await import('@/lib/db/schema')
      const { eq } = await import('drizzle-orm')
      const filas = await getDb().select().from(hazardClimatology).where(eq(hazardClimatology.version, VERSION))
      // 6 de CELDA_A (corrida anterior) + 6 de CELDA_B (esta corrida) = 12
      expect(filas).toHaveLength(12)
    })

    it('si todas las celdas ya están calculadas (aunque sea la primera vez que se adquiere el lease), no llama a obtenerSeries', async () => {
      // Escenario reachable vía la API pública: para un período+version
      // NUEVO (lease nunca adquirido), las filas de `hazard_climatology` ya
      // están precargadas por fuera del job (p. ej. una migración de datos o
      // una corrida previa con otra herramienta) — el cursor resumable debe
      // reconocerlas como "ya calculadas" y no gastar cupo en absoluto.
      const VERSION_PRECALCULADA = 'climatologia-v5-todo-precalculado'
      const { getDb } = await import('@/lib/db')
      const { hazardClimatology } = await import('@/lib/db/schema')
      const db = getDb()

      for (const celda of [CELDA_A, CELDA_B]) {
        await db.insert(hazardClimatology).values({
          id: randomUUID(),
          geometryRef: celda,
          variable: 'precipitacion_diaria',
          percentil: 'p90',
          muestra: 'todos_los_dias',
          valor: 1,
          unidad: 'mm',
          periodoDesde: PERIODO_DESDE,
          periodoHasta: PERIODO_HASTA,
          version: VERSION_PRECALCULADA,
          calculadoEn: '2026-09-26T00:00:00.000Z',
        })
      }

      const obtenerSeries = vi.fn<typeof ObtenerSeriesHistoricas>(async () => {
        throw new Error('no debería llamarse: no hay celdas pendientes')
      })

      const resultado = await ejecutarCalculoClimatologia({
        periodoDesde: PERIODO_DESDE,
        periodoHasta: PERIODO_HASTA,
        version: VERSION_PRECALCULADA,
        obtenerSeries,
      })

      expect(resultado).toEqual({
        ok: true,
        resultado: { celdasProcesadas: 2, filasInsertadas: 0, celdasConError: [], cortadoPorCupo: false },
      })
      expect(obtenerSeries).not.toHaveBeenCalled()
    })
  })
})
