import { beforeAll, describe, expect, it } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb } from '@/lib/db'
import { hazardClimatology, infraJobRun } from '@/lib/db/schema'
import type { ejecutarCalculoClimatologiaCaudal as EjecutarCalculoClimatologiaCaudal } from './calcular-climatologia-caudal'
import type { obtenerSeriesHistoricasCaudal as ObtenerSeriesHistoricasCaudal } from '../providers/climatologia-caudal'
import { obtenerPuntosRio } from '../puntos-rio'

usarDbTemporal('calcular-climatologia-caudal-')

beforeAll(async () => {
  ;({ ejecutarCalculoClimatologiaCaudal } = await import('./calcular-climatologia-caudal'))
})

let ejecutarCalculoClimatologiaCaudal: typeof EjecutarCalculoClimatologiaCaudal

// Serie sintética conocida: 10 días con caudal 0 + 10 días con caudal
// {1..9, 100}. Produce 3 filas de `todos_los_dias` por punto (ver
// climatologia-caudal.test.ts).
const SERIE_SINTETICA = [3, 0, 100, 5, 0, 1, 0, 8, 2, 0, 9, 0, 4, 0, 6, 0, 7, 0, 0, 0]

const PUNTO_CAIDO = obtenerPuntosRio()[0].id

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

describe('ejecutarCalculoClimatologiaCaudal', () => {
  it('primera corrida inserta 3 filas por punto para los 8 puntos de obtenerPuntosRio()', async () => {
    const resultado = await ejecutarCalculoClimatologiaCaudal({ obtenerSeries: seriesOkFake() })

    expect(resultado).toEqual({
      ok: true,
      resultado: {
        puntosProcesados: obtenerPuntosRio().length,
        filasInsertadas: obtenerPuntosRio().length * 3,
        puntosConError: [],
        puntosYaCompletos: 0,
      },
    })

    const filas = await getDb().select().from(hazardClimatology)
    expect(filas).toHaveLength(obtenerPuntosRio().length * 3)

    const refs = new Set(filas.map((fila) => fila.geometryRef))
    for (const punto of obtenerPuntosRio()) {
      expect(refs.has(punto.id)).toBe(true)
    }
    expect(filas.every((fila) => fila.variable === 'caudal_diario')).toBe(true)
    expect(filas.every((fila) => fila.muestra === 'todos_los_dias')).toBe(true)
  })

  it('repetir la misma corrida (mismo período/versión) no adquiere lease y no duplica filas', async () => {
    const db = getDb()

    const antes = await db.select().from(hazardClimatology)
    expect(antes).toHaveLength(obtenerPuntosRio().length * 3)

    const resultado = await ejecutarCalculoClimatologiaCaudal({ obtenerSeries: seriesOkFake() })
    expect(resultado).toEqual({ ok: false, motivo: 'lease_no_disponible' })

    const despues = await db.select().from(hazardClimatology)
    expect(despues).toHaveLength(obtenerPuntosRio().length * 3)
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
        puntosProcesados: obtenerPuntosRio().length - 1,
        filasInsertadas: (obtenerPuntosRio().length - 1) * 3,
        puntosConError: [PUNTO_CAIDO],
        puntosYaCompletos: 0,
      },
    })

    const filas = await getDb().select().from(hazardClimatology)
    // 24 de la versión v0.1 + 21 de la v0.2 (sólo los puntos que respondieron ok)
    expect(filas).toHaveLength(obtenerPuntosRio().length * 3 + (obtenerPuntosRio().length - 1) * 3)
  })

  // Regresión P-1: antes del fix, una corrida donde ningún punto se procesó
  // quedaba 'completado' con 0 filas y sin error guardado, y bloqueaba el
  // reintento de la misma clave. Ahora queda 'fallido' con el error por punto.
  it('si ningún punto se procesa, el job-run queda fallido con el error por punto y es reintentable', async () => {
    const periodoDesde = '2003-01-01'
    const periodoHasta = '2012-12-31'
    const version = 'caudal-climatologia-v0.4-todos-fallan'
    const seriesTodasCaidas: typeof ObtenerSeriesHistoricasCaudal = async ({ puntos }) => {
      const erroresPorPunto: Record<string, { motivo: string; detalle: string }> = {}
      for (const punto of puntos) {
        erroresPorPunto[punto.id] = { motivo: 'sin_datos', detalle: 'fake: todos caídos' }
      }
      return { seriesPorPunto: {}, erroresPorPunto }
    }

    const resultado = await ejecutarCalculoClimatologiaCaudal({
      periodoDesde,
      periodoHasta,
      version,
      obtenerSeries: seriesTodasCaidas,
    })
    expect(resultado).toEqual({
      ok: true,
      resultado: {
        puntosProcesados: 0,
        filasInsertadas: 0,
        puntosConError: obtenerPuntosRio().map((punto) => punto.id),
        puntosYaCompletos: 0,
      },
    })

    const { eq } = await import('drizzle-orm')
    const clave = `${periodoDesde}_${periodoHasta}_${version}`
    const [fila] = await getDb()
      .select()
      .from(infraJobRun)
      .where(eq(infraJobRun.claveIdempotente, clave))

    expect(fila?.estado).toBe('fallido')
    expect(fila?.leaseOwner).toBeNull()
    expect(fila?.errorSaneado).toBeTruthy()
    for (const punto of obtenerPuntosRio()) {
      expect(fila?.errorSaneado).toContain(punto.id)
    }

    // Al quedar 'fallido' la misma clave vuelve a adquirir lease.
    const reintento = await ejecutarCalculoClimatologiaCaudal({
      periodoDesde,
      periodoHasta,
      version,
      obtenerSeries: seriesOkFake(),
    })
    expect(reintento).toEqual({
      ok: true,
      resultado: {
        puntosProcesados: obtenerPuntosRio().length,
        filasInsertadas: obtenerPuntosRio().length * 3,
        puntosConError: [],
        puntosYaCompletos: 0,
      },
    })
  })

  // Cursor resumable: una falla parcial deja la corrida 'fallido' (la clave
  // sigue reintentable) con constancia en `contadores` y `errorSaneado`; antes
  // quedaba 'completado' y los puntos faltantes no se reintentaban nunca.
  it('una falla parcial queda fallido con contadores.puntosConError y errorSaneado', async () => {
    const periodoDesde = '2004-01-01'
    const periodoHasta = '2013-12-31'
    const version = 'caudal-climatologia-v0.5-parcial'

    await ejecutarCalculoClimatologiaCaudal({
      periodoDesde,
      periodoHasta,
      version,
      obtenerSeries: seriesConPuntoCaidoFake(),
    })

    const { eq } = await import('drizzle-orm')
    const clave = `${periodoDesde}_${periodoHasta}_${version}`
    const [fila] = await getDb()
      .select()
      .from(infraJobRun)
      .where(eq(infraJobRun.claveIdempotente, clave))

    expect(fila?.estado).toBe('fallido')
    expect(fila?.contadores).toEqual({
      puntos: obtenerPuntosRio().length - 1,
      filas: (obtenerPuntosRio().length - 1) * 3,
      puntosConError: 1,
      puntosYaCompletos: 0,
    })
    expect(fila?.errorSaneado).toContain(PUNTO_CAIDO)
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

  // Cursor resumable (cupo diario de Open-Meteo): cada punto se pide por
  // separado y se persiste apenas responde, así el avance de un día sobrevive
  // aunque el resto de los puntos se quede sin cupo.
  it('pide cada punto en una llamada propia', async () => {
    const pedidos: string[][] = []
    const obtenerSeries: typeof ObtenerSeriesHistoricasCaudal = async (params) => {
      pedidos.push(params.puntos.map((punto) => punto.id))
      return seriesOkFake()(params)
    }

    await ejecutarCalculoClimatologiaCaudal({
      periodoDesde: '2005-01-01',
      periodoHasta: '2014-12-31',
      version: 'caudal-climatologia-v0.6-por-punto',
      obtenerSeries,
    })

    expect(pedidos).toEqual(obtenerPuntosRio().map((punto) => [punto.id]))
  })

  it('ante cupo agotado corta sin pedir más puntos y la próxima corrida retoma sólo los pendientes', async () => {
    const periodoDesde = '2006-01-01'
    const periodoHasta = '2015-12-31'
    const version = 'caudal-climatologia-v0.7-reanuda'
    const puntos = obtenerPuntosRio()
    const pedidosPrimera: string[] = []
    const cupoAlTercero: typeof ObtenerSeriesHistoricasCaudal = async (params) => {
      const [punto] = params.puntos
      pedidosPrimera.push(punto.id)
      if (pedidosPrimera.length >= 3) {
        return {
          seriesPorPunto: {},
          erroresPorPunto: { [punto.id]: { motivo: 'cupo_agotado', detalle: 'fake: ventana dia' } },
        }
      }
      return seriesOkFake()(params)
    }

    const primera = await ejecutarCalculoClimatologiaCaudal({
      periodoDesde,
      periodoHasta,
      version,
      obtenerSeries: cupoAlTercero,
    })

    expect(pedidosPrimera).toEqual(puntos.slice(0, 3).map((punto) => punto.id))
    expect(primera).toEqual({
      ok: true,
      resultado: {
        puntosProcesados: 2,
        filasInsertadas: 6,
        puntosConError: puntos.slice(2).map((punto) => punto.id),
        puntosYaCompletos: 0,
      },
    })

    const { and, eq } = await import('drizzle-orm')
    const clave = `${periodoDesde}_${periodoHasta}_${version}`
    const [run] = await getDb().select().from(infraJobRun).where(eq(infraJobRun.claveIdempotente, clave))
    expect(run?.estado).toBe('fallido')

    const pedidosSegunda: string[] = []
    const segunda = await ejecutarCalculoClimatologiaCaudal({
      periodoDesde,
      periodoHasta,
      version,
      obtenerSeries: async (params) => {
        pedidosSegunda.push(...params.puntos.map((punto) => punto.id))
        return seriesOkFake()(params)
      },
    })

    expect(pedidosSegunda).toEqual(puntos.slice(2).map((punto) => punto.id))
    expect(segunda).toEqual({
      ok: true,
      resultado: {
        puntosProcesados: puntos.length - 2,
        filasInsertadas: (puntos.length - 2) * 3,
        puntosConError: [],
        puntosYaCompletos: 2,
      },
    })

    const filas = await getDb()
      .select()
      .from(hazardClimatology)
      .where(and(eq(hazardClimatology.version, version), eq(hazardClimatology.periodoDesde, periodoDesde)))
    expect(filas).toHaveLength(puntos.length * 3)
    const [runFinal] = await getDb().select().from(infraJobRun).where(eq(infraJobRun.claveIdempotente, clave))
    expect(runFinal?.estado).toBe('completado')
  })
})
