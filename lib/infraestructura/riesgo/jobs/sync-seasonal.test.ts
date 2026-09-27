import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CENTROIDES_DEPARTAMENTOS_CORRIENTES } from '@/lib/mapas/departamento-centroides'
import type { EstadisticaEstacionalDepartamento } from '../providers/seasonal'
import type { obtenerTendenciaEstacional as ObtenerTendenciaEstacionalReal } from '../providers/seasonal'
import type { ejecutarSyncSeasonal as EjecutarSyncSeasonal } from './sync-seasonal'

let dir: string
let prevDataDir: string | undefined

let ejecutarSyncSeasonal: typeof EjecutarSyncSeasonal

type ArgsProvider = Parameters<typeof ObtenerTendenciaEstacionalReal>[0]

// Fake sin red: por cada departamento del lote, emite una estadística
// determinística. Un departamento en `erroresParaDepartamentos` cae en
// `erroresPorDepartamento` en vez de emitir fila (mismo contrato del
// provider real: un error no interrumpe al resto del lote).
function seasonalFake(opciones?: {
  erroresParaDepartamentos?: Set<string>
  onLlamada?: (args: ArgsProvider) => void
}): typeof ObtenerTendenciaEstacionalReal {
  return async (args) => {
    opciones?.onLlamada?.(args)
    const estadisticas: EstadisticaEstacionalDepartamento[] = []
    const erroresPorDepartamento: Record<string, string> = {}

    for (const centroide of args.centroides) {
      if (opciones?.erroresParaDepartamentos?.has(centroide.departamento)) {
        erroresPorDepartamento[centroide.departamento] = 'timeout: fixture de test'
        continue
      }
      estadisticas.push({
        departamento: centroide.departamento,
        variable: 'precipitacion_acumulada',
        emisionEn: args.emisionEn.toISOString().slice(0, 10),
        validoDesde: '2026-10-27',
        validoHasta: '2026-12-26',
        horizonteDesdeDias: args.horizonteDesdeDias ?? 30,
        horizonteHastaDias: args.horizonteHastaDias ?? 90,
        miembrosTotal: 51,
        miembrosValidos: 51,
        mediaMm: 120.5,
        medianaMm: 118,
        dispersionMm: 12.3,
        probabilidadSobreNormal: 0.42,
      })
    }

    return { estadisticas, erroresPorDepartamento, llamadasRealizadas: 1 }
  }
}

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'sync-seasonal-'))
  prevDataDir = process.env.DATA_DIR
  process.env.DATA_DIR = dir

  const { ensureSeeded } = await import('@/lib/db/seed')
  await ensureSeeded()
  ;({ ejecutarSyncSeasonal } = await import('./sync-seasonal'))
})

afterAll(() => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  rmSync(dir, { recursive: true, force: true })
})

describe('ejecutarSyncSeasonal', () => {
  it('corrida normal inserta una fila por departamento y deja la salud en ok', async () => {
    const ahora = new Date('2026-09-27T09:00:00.000Z')
    let llamadas = 0

    const resultado = await ejecutarSyncSeasonal({
      ahora,
      obtenerTendenciaEstacional: seasonalFake({
        onLlamada: () => {
          llamadas += 1
        },
      }),
    })

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) throw new Error('unreachable')
    expect(resultado.resultado.departamentosConsultados).toBe(
      CENTROIDES_DEPARTAMENTOS_CORRIENTES.length,
    )
    expect(resultado.resultado.filasInsertadas).toBe(CENTROIDES_DEPARTAMENTOS_CORRIENTES.length)
    expect(llamadas).toBeGreaterThan(0)

    const { getDb } = await import('@/lib/db')
    const { hazardSeasonalTrend, hazardSourceHealth } = await import('@/lib/db/schema')
    const db = getDb()

    const filas = await db.select().from(hazardSeasonalTrend)
    expect(filas).toHaveLength(CENTROIDES_DEPARTAMENTOS_CORRIENTES.length)
    expect(filas.every((f) => f.emisionEn === '2026-09-27')).toBe(true)
    expect(filas.every((f) => f.variable === 'precipitacion_acumulada')).toBe(true)
    expect(filas.every((f) => f.provider === 'open-meteo-seasonal')).toBe(true)
    expect(filas.every((f) => f.version === 'seasonal-v0.1')).toBe(true)

    const salud = await db.select().from(hazardSourceHealth)
    const seasonal = salud.find((f) => f.provider === 'open-meteo-seasonal')
    expect(seasonal?.estado).toBe('ok')
    expect(seasonal?.ultimoExitoEn).toBe(ahora.toISOString())
    expect(seasonal?.ultimoErrorSaneado).toBeNull()
  })

  it('repetir el sync el MISMO día UTC no adquiere lease y no duplica filas', async () => {
    const { getDb } = await import('@/lib/db')
    const { hazardSeasonalTrend } = await import('@/lib/db/schema')
    const db = getDb()

    const antes = (await db.select().from(hazardSeasonalTrend)).length

    const ahora = new Date('2026-09-27T20:00:00.000Z') // mismo día UTC
    const resultado = await ejecutarSyncSeasonal({
      ahora,
      obtenerTendenciaEstacional: seasonalFake(),
    })

    expect(resultado).toEqual({ ok: false, motivo: 'lease_no_disponible' })

    const despues = (await db.select().from(hazardSeasonalTrend)).length
    expect(despues).toBe(antes)
  })

  it('al día siguiente adquiere un nuevo lease (nueva claveIdempotente) y upsertea sin duplicar', async () => {
    const ahora = new Date('2026-09-28T09:00:00.000Z')
    const resultado = await ejecutarSyncSeasonal({
      ahora,
      obtenerTendenciaEstacional: seasonalFake(),
    })

    expect(resultado.ok).toBe(true)

    const { getDb } = await import('@/lib/db')
    const { hazardSeasonalTrend } = await import('@/lib/db/schema')
    const db = getDb()
    const filas = await db.select().from(hazardSeasonalTrend)
    // Dos emisiones distintas (2026-09-27 y 2026-09-28) por departamento.
    expect(filas).toHaveLength(CENTROIDES_DEPARTAMENTOS_CORRIENTES.length * 2)
  })

  it('un departamento con error del provider no rompe el resto y queda en degradado', async () => {
    const ahora = new Date('2026-09-29T09:00:00.000Z')
    const primerDepartamento = CENTROIDES_DEPARTAMENTOS_CORRIENTES[0].departamento

    const resultado = await ejecutarSyncSeasonal({
      ahora,
      obtenerTendenciaEstacional: seasonalFake({
        erroresParaDepartamentos: new Set([primerDepartamento]),
      }),
    })

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) throw new Error('unreachable')
    expect(resultado.resultado.filasInsertadas).toBe(
      CENTROIDES_DEPARTAMENTOS_CORRIENTES.length - 1,
    )

    const { getDb } = await import('@/lib/db')
    const { hazardSourceHealth } = await import('@/lib/db/schema')
    const salud = await getDb().select().from(hazardSourceHealth)
    const seasonal = salud.find((f) => f.provider === 'open-meteo-seasonal')
    expect(seasonal?.estado).toBe('degradado')
    expect(seasonal?.ultimoErrorSaneado).toBe('timeout: fixture de test')
  })
})
