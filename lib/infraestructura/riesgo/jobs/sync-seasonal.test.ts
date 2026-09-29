import { beforeAll, describe, expect, it } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { CENTROIDES_DEPARTAMENTOS_CORRIENTES } from '@/lib/mapas/departamento-centroides'
import type { EstadisticaEstacionalDepartamento } from '../providers/seasonal'
import type { obtenerTendenciaEstacional as ObtenerTendenciaEstacionalReal } from '../providers/seasonal'
import type { ejecutarSyncSeasonal as EjecutarSyncSeasonal } from './sync-seasonal'
import type { PuertoTendenciaEstacional } from '../adaptadores-ingesta/puertos'

usarDbTemporal('sync-seasonal-')

beforeAll(async () => {
  ;({ ejecutarSyncSeasonal } = await import('./sync-seasonal'))
})

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

  // Guard #3 del batch OM-cupo conectado también en el job (requisito 4:
  // "conectá el guard también en sync-seasonal, no sólo en el proveedor"):
  // con un límite de minuto forzado a casi 0, el peso de CUALQUIER tanda lo
  // supera por sí solo — el guard debe cortar esa tanda con un error
  // explícito (capturado, no un throw que tumbe el job) en vez de llamar al
  // provider y dejar que reintente contra un `cupo_minuto_agotado`
  // imposible de satisfacer.
  it('el guard de peso alcanzable corta la tanda ANTES de llamar al provider si el límite de minuto es imposible', async () => {
    const prevLimite = process.env.OPEN_METEO_LIMITE_MINUTO
    process.env.OPEN_METEO_LIMITE_MINUTO = '1'
    try {
      const ahora = new Date('2026-10-05T09:00:00.000Z')
      let llamadasAlProvider = 0

      const resultado = await ejecutarSyncSeasonal({
        ahora,
        obtenerTendenciaEstacional: seasonalFake({
          onLlamada: () => {
            llamadasAlProvider += 1
          },
        }),
      })

      expect(llamadasAlProvider).toBe(0)
      expect(resultado.ok).toBe(true)
      if (!resultado.ok) throw new Error('unreachable')
      // Ningún departamento consiguió fila (el guard cortó todas las tandas
      // antes de tocar la red), pero el job TERMINA (no tumba el proceso).
      expect(resultado.resultado.filasInsertadas).toBe(0)

      const { getDb } = await import('@/lib/db')
      const { hazardSourceHealth } = await import('@/lib/db/schema')
      const salud = await getDb().select().from(hazardSourceHealth)
      const seasonal = salud.find((f) => f.provider === 'open-meteo-seasonal')
      expect(seasonal?.estado).toBe('degradado')
    } finally {
      if (prevLimite === undefined) delete process.env.OPEN_METEO_LIMITE_MINUTO
      else process.env.OPEN_METEO_LIMITE_MINUTO = prevLimite
    }
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

  // Cableado por PUERTO (ABS1, segunda parte): a diferencia de los demás
  // tests (que inyectan `obtenerTendenciaEstacional`, la función cruda del
  // provider), acá se inyecta el PUERTO completo (`PuertoTendenciaEstacional`)
  // directamente, sin adaptador ni provider real. Cero red.
  it('con un puerto fake inyectado directamente (sin adaptador, sin red) persiste sus estadísticas', async () => {
    const ahora = new Date('2026-09-30T09:00:00.000Z')
    const llamadas: Parameters<PuertoTendenciaEstacional['obtenerTendencia']>[0][] = []

    const puertoFake: PuertoTendenciaEstacional = {
      async obtenerTendencia(params) {
        llamadas.push(params)
        return {
          estadisticas: params.centroides.map((centroide) => ({
            departamento: centroide.departamento,
            variable: 'precipitacion_acumulada' as const,
            emisionEn: params.emisionEn,
            validoDesde: params.emisionEn,
            validoHasta: params.emisionEn,
            horizonteDesdeDias: params.horizonteDesdeDias,
            horizonteHastaDias: params.horizonteHastaDias,
            miembrosTotal: 51,
            miembrosValidos: 51,
            mediaMm: 33.3,
            medianaMm: 30,
            dispersionMm: 4.4,
            probabilidadSobreNormal: 0.6,
          })),
          sinDato: {},
        }
      },
    }

    const resultado = await ejecutarSyncSeasonal({ ahora, puerto: puertoFake })

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) throw new Error('unreachable')
    expect(resultado.resultado.filasInsertadas).toBe(CENTROIDES_DEPARTAMENTOS_CORRIENTES.length)
    // El job sigue pasando los defaults 30/90 explícitos al puerto (ver
    // sync-seasonal.ts): mismo horizonte que usaba el provider por default.
    expect(llamadas.every((l) => l.horizonteDesdeDias === 30 && l.horizonteHastaDias === 90)).toBe(
      true,
    )

    const { getDb } = await import('@/lib/db')
    const { hazardSeasonalTrend } = await import('@/lib/db/schema')
    const emisionesVistas = [...new Set(llamadas.map((l) => l.emisionEn))]
    const filas = await getDb()
      .select()
      .from(hazardSeasonalTrend)
      .where(
        (await import('drizzle-orm')).inArray(hazardSeasonalTrend.emisionEn, emisionesVistas),
      )
    expect(filas.length).toBe(CENTROIDES_DEPARTAMENTOS_CORRIENTES.length)
    expect(filas.every((fila) => fila.mediaMm === 33.3)).toBe(true)
  })
})
