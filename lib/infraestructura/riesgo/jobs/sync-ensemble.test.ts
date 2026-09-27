import { mkdtempSync, rmSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { HazardEnsembleProbPunto } from '../providers/ensemble'
import type {
  obtenerProbabilidadesEnsemble as obtenerProbabilidadesEnsembleReal,
} from '../providers/ensemble'
import type { ejecutarSyncEnsemble as EjecutarSyncEnsemble } from './sync-ensemble'

let dir: string
let prevDataDir: string | undefined

let ejecutarSyncEnsemble: typeof EjecutarSyncEnsemble

// Tres celdas base. El job reconstruye lat/lon desde `geometryRef`, así que
// las coordenadas guardadas en `infra_geo_profile` son irrelevantes para el
// job; las dejamos consistentes de todos modos.
const CELDAS = ['-27.4_-58.8', '-27.5_-58.9', '-28.0_-56.5']

const P95_DEFAULT = 20
const P99_DEFAULT = 40
const PUNTOS_POR_CELDA_DEFAULT = 3

type ArgsProvider = Parameters<typeof obtenerProbabilidadesEnsembleReal>[0]

// Fake sin red que respeta el contrato del provider real: si a una celda le
// falta cualquiera de los dos umbrales la marca `'sin_climatologia'` y no
// emite puntos. Así los tests validan que el job arma bien los Map de
// climatología y no sólo que el fake responde.
function ensembleFake(opciones?: {
  puntosPorCelda?: number
  onLlamada?: (args: ArgsProvider) => void
}): typeof obtenerProbabilidadesEnsembleReal {
  return async (args) => {
    opciones?.onLlamada?.(args)
    const puntos: HazardEnsembleProbPunto[] = []
    const erroresPorCelda: Record<string, string> = {}
    const cantidad = opciones?.puntosPorCelda ?? PUNTOS_POR_CELDA_DEFAULT

    for (const celda of args.geometryRefsConCoordenada) {
      const umbralP95 = args.umbralP95PorCelda.get(celda.geometryRef)
      const umbralP99 = args.umbralP99PorCelda.get(celda.geometryRef)
      if (umbralP95 === undefined || umbralP99 === undefined) {
        erroresPorCelda[celda.geometryRef] = 'sin_climatologia'
        continue
      }
      for (let indice = 0; indice < cantidad; indice++) {
        puntos.push({
          geometryRef: celda.geometryRef,
          variable: 'precipitacion_24h',
          corridaEn: args.corridaEn,
          validoEn: new Date(
            Date.parse(args.corridaEn) + (indice + 1) * 24 * 3_600_000,
          ).toISOString(),
          horizonteHoras: (indice + 1) * 24,
          miembrosTotal: 51,
          miembrosValidos: 51,
          probabilidadP95: 0.3,
          probabilidadP99: 0.1,
          dispersion: 1.5,
        })
      }
    }

    return { puntos, erroresPorCelda }
  }
}

function filasClimatologia(geometryRef: string) {
  const base = {
    geometryRef,
    variable: 'precipitacion_diaria',
    muestra: 'todos_los_dias',
    unidad: 'mm',
    periodoDesde: '1991-01-01',
    periodoHasta: '2020-12-31',
    version: 'climatologia-v1',
    calculadoEn: '2026-09-26T00:00:00.000Z',
  }
  return [
    { ...base, id: randomUUID(), percentil: 'p95', valor: P95_DEFAULT },
    { ...base, id: randomUUID(), percentil: 'p99', valor: P99_DEFAULT },
  ]
}

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'sync-ensemble-'))
  prevDataDir = process.env.DATA_DIR
  process.env.DATA_DIR = dir

  const { ensureSeeded } = await import('@/lib/db/seed')
  await ensureSeeded()
  ;({ ejecutarSyncEnsemble } = await import('./sync-ensemble'))

  const { getDb } = await import('@/lib/db')
  const { hazardClimatology, infraGeoProfile } = await import('@/lib/db/schema')
  const db = getDb()

  await db.insert(infraGeoProfile).values(
    CELDAS.map((geometryRef, indice) => ({
      cueAnexo: `180000${indice + 1}-00`,
      geometryRef,
      motivoExclusion: null,
      perfilVersion: 'geo-perfil-v1',
      calculadoEn: '2026-09-26T00:00:00.000Z',
    })),
  )

  await db.insert(hazardClimatology).values(CELDAS.flatMap((celda) => filasClimatologia(celda)))
})

afterAll(() => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  rmSync(dir, { recursive: true, force: true })
})

describe('ejecutarSyncEnsemble', () => {
  it('corrida normal inserta filas con climatología precargada y deja la salud en ok', async () => {
    const ahora = new Date('2026-09-26T01:00:00.000Z') // bloque 00-06
    let argsCapturados: ArgsProvider | undefined

    const resultado = await ejecutarSyncEnsemble({
      ahora,
      obtenerProbabilidades: ensembleFake({
        onLlamada: (args) => {
          argsCapturados = args
        },
      }),
    })

    expect(resultado).toEqual({
      ok: true,
      resultado: {
        celdasConsultadas: CELDAS.length,
        filasInsertadas: CELDAS.length * PUNTOS_POR_CELDA_DEFAULT,
        llamadasRealizadas: 1,
      },
    })

    // El job arma los Map de climatología y ancla la corrida al bloque de 6h.
    expect(argsCapturados?.acumuladoHoras).toBe(24)
    expect(argsCapturados?.corridaEn).toBe('2026-09-26T00:00:00.000Z')
    expect(argsCapturados?.umbralP95PorCelda.get(CELDAS[0])).toBe(P95_DEFAULT)
    expect(argsCapturados?.umbralP99PorCelda.get(CELDAS[0])).toBe(P99_DEFAULT)

    const { getDb } = await import('@/lib/db')
    const { hazardEnsembleProb, hazardSourceHealth } = await import('@/lib/db/schema')
    const db = getDb()

    const filas = await db.select().from(hazardEnsembleProb)
    expect(filas).toHaveLength(CELDAS.length * PUNTOS_POR_CELDA_DEFAULT)
    expect(filas.every((f) => f.corridaEn === '2026-09-26T00:00:00.000Z')).toBe(true)
    expect(filas.every((f) => f.variable === 'precipitacion_24h')).toBe(true)
    expect(filas.every((f) => f.version === 'ensemble-v0.1')).toBe(true)

    const salud = await db.select().from(hazardSourceHealth)
    const ensemble = salud.find((f) => f.provider === 'open-meteo-ensemble')
    expect(ensemble?.estado).toBe('ok')
    expect(ensemble?.ultimoExitoEn).toBe(ahora.toISOString())
    expect(ensemble?.ultimoErrorSaneado).toBeNull()
  })

  it('repetir el sync en la misma ventana de 6h no adquiere lease y no duplica filas', async () => {
    const { getDb } = await import('@/lib/db')
    const { hazardEnsembleProb } = await import('@/lib/db/schema')
    const db = getDb()

    const antes = (await db.select().from(hazardEnsembleProb)).length

    const ahora = new Date('2026-09-26T01:00:00.000Z') // MISMO bloque 00-06
    const resultado = await ejecutarSyncEnsemble({
      ahora,
      obtenerProbabilidades: ensembleFake(),
    })

    expect(resultado).toEqual({ ok: false, motivo: 'lease_no_disponible' })

    const despues = (await db.select().from(hazardEnsembleProb)).length
    expect(despues).toBe(antes)
  })
})

describe('ejecutarSyncEnsemble — celda sin climatología', () => {
  const CELDA_SIN = '-33.3_-66.6'
  const CUE_SIN = '1800099-00'

  beforeAll(async () => {
    const { getDb } = await import('@/lib/db')
    const { infraGeoProfile } = await import('@/lib/db/schema')
    await getDb().insert(infraGeoProfile).values({
      cueAnexo: CUE_SIN,
      geometryRef: CELDA_SIN,
      motivoExclusion: null,
      perfilVersion: 'geo-perfil-v1',
      calculadoEn: '2026-09-26T00:00:00.000Z',
    })
  })

  afterAll(async () => {
    const { getDb } = await import('@/lib/db')
    const { infraGeoProfile } = await import('@/lib/db/schema')
    await getDb().delete(infraGeoProfile).where(inArray(infraGeoProfile.cueAnexo, [CUE_SIN]))
  })

  it('una celda sin climatología no rompe el resto y queda fuera de las filas persistidas', async () => {
    const ahora = new Date('2026-09-26T07:00:00.000Z') // bloque 06-12

    const resultado = await ejecutarSyncEnsemble({
      ahora,
      obtenerProbabilidades: ensembleFake(),
    })

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) throw new Error('unreachable')
    // La celda sin climatología se consulta pero no emite puntos.
    expect(resultado.resultado.celdasConsultadas).toBe(CELDAS.length + 1)
    expect(resultado.resultado.filasInsertadas).toBe(CELDAS.length * PUNTOS_POR_CELDA_DEFAULT)
    expect(resultado.resultado.llamadasRealizadas).toBe(1)

    const { getDb } = await import('@/lib/db')
    const { hazardEnsembleProb, hazardSourceHealth } = await import('@/lib/db/schema')
    const db = getDb()

    const deLaCeldaSin = await db
      .select()
      .from(hazardEnsembleProb)
      .where(inArray(hazardEnsembleProb.geometryRef, [CELDA_SIN]))
    expect(deLaCeldaSin).toHaveLength(0)

    const salud = await db.select().from(hazardSourceHealth)
    const ensemble = salud.find((f) => f.provider === 'open-meteo-ensemble')
    expect(ensemble?.estado).toBe('degradado')
    expect(ensemble?.ultimoErrorSaneado).toBe('sin_climatologia')
  })
})

// --- Renovación activa del lease durante el loop ---
//
// `TAMANO_TANDA_CELDAS` es 20 en la implementación. Para forzar más de una
// renovación necesitamos > 40 celdas, así que insertamos 60 perfiles extra
// (total 63 con las 3 base) y los limpiamos en el afterAll.
const CELDAS_EXTRA = Array.from({ length: 60 }, (_, indice) => ({
  cueAnexo: `199000${indice + 1}-00`,
  geometryRef: `${(-31 - indice * 0.1).toFixed(1)}_-60.0`,
}))

type RenovarLeaseParamsTest = {
  jobRunId: string
  leaseOwner: string
  duracionLeaseMs: number
  ahora?: Date
}

describe('ejecutarSyncEnsemble — renovación de lease durante el loop', () => {
  beforeAll(async () => {
    const { getDb } = await import('@/lib/db')
    const { hazardClimatology, infraGeoProfile } = await import('@/lib/db/schema')
    const db = getDb()
    await db.insert(infraGeoProfile).values(
      CELDAS_EXTRA.map(({ cueAnexo, geometryRef }) => ({
        cueAnexo,
        geometryRef,
        motivoExclusion: null,
        perfilVersion: 'geo-perfil-v1',
        calculadoEn: '2026-09-26T00:00:00.000Z',
      })),
    )
    await db
      .insert(hazardClimatology)
      .values(CELDAS_EXTRA.flatMap(({ geometryRef }) => filasClimatologia(geometryRef)))
  })

  afterAll(async () => {
    const { getDb } = await import('@/lib/db')
    const { hazardClimatology, infraGeoProfile } = await import('@/lib/db/schema')
    const refs = CELDAS_EXTRA.map(({ geometryRef }) => geometryRef)
    const cueAnexos = CELDAS_EXTRA.map(({ cueAnexo }) => cueAnexo)
    const db = getDb()
    await db.delete(hazardClimatology).where(inArray(hazardClimatology.geometryRef, refs))
    await db.delete(infraGeoProfile).where(inArray(infraGeoProfile.cueAnexo, cueAnexos))
  })

  it('renueva el lease más de una vez cuando las celdas superan el umbral de tanda', async () => {
    const ahora = new Date('2026-09-26T13:00:00.000Z') // bloque 12-18
    const renovarLease = vi.fn(async (_params: RenovarLeaseParamsTest) => true)

    const resultado = await ejecutarSyncEnsemble({
      ahora,
      obtenerProbabilidades: ensembleFake(),
      renovarLease,
    })

    // 3 base + 60 extra = 63 celdas: con tandas de 20 hay 4 tandas y 3
    // renovaciones intermedias.
    expect(renovarLease.mock.calls.length).toBeGreaterThan(1)
    expect(renovarLease).toHaveBeenCalledTimes(3)
    const primerLlamado = renovarLease.mock.calls[0]?.[0]
    // No se pasa `ahora`: la renovación debe correr el vencimiento con el
    // reloj actual, igual que en sync-pronostico-caudal.ts.
    expect(primerLlamado?.ahora).toBeUndefined()
    expect(primerLlamado?.duracionLeaseMs).toBe(5 * 60 * 1000)
    expect(typeof primerLlamado?.jobRunId).toBe('string')
    expect(typeof primerLlamado?.leaseOwner).toBe('string')

    if (!resultado.ok) throw new Error('unreachable')
    expect(resultado.resultado.celdasConsultadas).toBe(CELDAS.length + CELDAS_EXTRA.length)
    expect(resultado.resultado.filasInsertadas).toBe(
      (CELDAS.length + CELDAS_EXTRA.length) * PUNTOS_POR_CELDA_DEFAULT,
    )
  })

  it('si renovarLease devuelve false corta y no sigue insertando filas', async () => {
    const ahora = new Date('2026-09-26T19:00:00.000Z') // bloque 18-24
    const renovarLease = vi.fn(async (_params: RenovarLeaseParamsTest) => false)

    const { getDb } = await import('@/lib/db')
    const { hazardEnsembleProb } = await import('@/lib/db/schema')
    const db = getDb()
    const antes = (await db.select().from(hazardEnsembleProb)).length

    const resultado = await ejecutarSyncEnsemble({
      ahora,
      obtenerProbabilidades: ensembleFake(),
      renovarLease,
    })

    if (resultado.ok || resultado.motivo !== 'lease_perdido_durante_ejecucion') {
      throw new Error('unreachable')
    }
    // Sólo se procesó la primera tanda (20 celdas) antes del corte.
    expect(resultado.resultado.celdasConsultadas).toBe(20)
    expect(resultado.resultado.llamadasRealizadas).toBe(1)
    expect(resultado.resultado.filasInsertadas).toBe(20 * PUNTOS_POR_CELDA_DEFAULT)
    expect(renovarLease).toHaveBeenCalledTimes(1)

    const despues = (await db.select().from(hazardEnsembleProb)).length
    expect(despues - antes).toBe(20 * PUNTOS_POR_CELDA_DEFAULT)
  })

  // Regresión: antes del fix, una excepción posterior a adquirir el lease
  // escapaba sin publicar resultado y `infra_job_run` quedaba 'en_progreso'
  // hasta el vencimiento del lease (mismo hallazgo que
  // sync-pronostico-caudal.ts).
  it('si renovarLease lanza, el job-run queda fallido y la excepción se relanza', async () => {
    const ahora = new Date('2026-09-27T13:00:00.000Z') // bloque propio, lease libre
    const errorOriginal = new Error('boom: fallo simulado durante la renovación')
    const renovarLease = vi.fn(async (_params: RenovarLeaseParamsTest) => {
      throw errorOriginal
    })

    await expect(
      ejecutarSyncEnsemble({
        ahora,
        obtenerProbabilidades: ensembleFake(),
        renovarLease,
      }),
    ).rejects.toThrow(errorOriginal)

    const { getDb } = await import('@/lib/db')
    const { infraJobRun } = await import('@/lib/db/schema')
    const { eq } = await import('drizzle-orm')
    const [fila] = await getDb()
      .select()
      .from(infraJobRun)
      .where(eq(infraJobRun.claveIdempotente, '2026-09-27T12'))

    expect(fila?.estado).toBe('fallido')
    expect(fila?.leaseOwner).toBeNull()
  })
})
