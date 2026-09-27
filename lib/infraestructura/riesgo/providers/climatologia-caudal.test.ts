import { describe, expect, it, vi } from 'vitest'
import {
  calcularPercentilesCaudal,
  obtenerSeriesHistoricasCaudal,
  TAMANO_LOTE_COORDENADAS_CAUDAL,
} from './climatologia-caudal'
import type { HazardClimatologiaCaudalPunto } from './climatologia-caudal'
import type { PuntoRio } from '../puntos-rio'

// Serie sintética conocida: 10 días con caudal 0 + 10 días con caudal
// {1..9, 100}. Se pasa desordenada a propósito para probar el orden interno.
// Ordenada ascendente: [0×10, 1, 2, 3, 4, 5, 6, 7, 8, 9, 100]  (n = 20)
//
// Percentiles esperados (método: ceil(p/100 * n) - 1, clampeado):
//   todos_los_dias (n=20, única muestra para caudal):
//     p90 -> ceil(18.0) - 1 = 17 -> 8
//     p95 -> ceil(19.0) - 1 = 18 -> 9
//     p99 -> ceil(19.8) - 1 = 19 -> 100
const SERIE_SINTETICA = [3, 0, 100, 5, 0, 1, 0, 8, 2, 0, 9, 0, 4, 0, 6, 0, 7, 0, 0, 0]
const ESPERADOS = { p90: 8, p95: 9, p99: 100 } as const

function buscarFila(
  filas: HazardClimatologiaCaudalPunto[],
  percentil: HazardClimatologiaCaudalPunto['percentil'],
): HazardClimatologiaCaudalPunto {
  const fila = filas.find((f) => f.percentil === percentil)
  if (!fila) throw new Error(`No se encontró la fila ${percentil}`)
  return fila
}

function puntoFake(id: string, lat: number, lon: number): PuntoRio {
  return {
    id,
    rio: 'parana',
    localidad: 'fake',
    lat,
    lon,
    criterio: 'fake para test',
  }
}

describe('calcularPercentilesCaudal', () => {
  it('calcula exactamente p90/p95/p99 de una serie sintética', () => {
    const filas = calcularPercentilesCaudal({
      geometryRef: 'parana-ituzaingo',
      valoresDiarios: SERIE_SINTETICA,
      periodoDesde: '2015-01-01',
      periodoHasta: '2024-12-31',
    })

    expect(filas).toHaveLength(3)

    for (const percentil of ['p90', 'p95', 'p99'] as const) {
      const fila = buscarFila(filas, percentil)
      expect(fila.valor).toBe(ESPERADOS[percentil])
      expect(fila.variable).toBe('caudal_diario')
      expect(fila.muestra).toBe('todos_los_dias')
      expect(fila.unidad).toBe('m3s')
      expect(fila.geometryRef).toBe('parana-ituzaingo')
      expect(fila.periodoDesde).toBe('2015-01-01')
      expect(fila.periodoHasta).toBe('2024-12-31')
    }
  })

  it('siempre usa la muestra todos_los_dias (no existe "día húmedo" para caudal)', () => {
    const filas = calcularPercentilesCaudal({
      geometryRef: 'x',
      valoresDiarios: SERIE_SINTETICA,
      periodoDesde: 'a',
      periodoHasta: 'b',
    })

    expect(filas.every((f) => f.muestra === 'todos_los_dias')).toBe(true)
  })

  it('una serie vacía no produce filas', () => {
    const filas = calcularPercentilesCaudal({
      geometryRef: 'x',
      valoresDiarios: [],
      periodoDesde: 'a',
      periodoHasta: 'b',
    })

    expect(filas).toEqual([])
  })
})

describe('obtenerSeriesHistoricasCaudal', () => {
  function fetchOk(body: unknown) {
    return vi.fn(async (_url: string) => new Response(JSON.stringify(body), { status: 200 }))
  }

  it('descarta los días null en vez de imputarlos como 0 m3s', async () => {
    const fetchImpl = fetchOk({
      daily: {
        time: ['2015-01-01', '2015-01-02', '2015-01-03'],
        river_discharge: [0, null, 5],
      },
    })

    const r = await obtenerSeriesHistoricasCaudal({
      puntos: [puntoFake('p1', -27.49, -56.8)],
      periodoDesde: '2015-01-01',
      periodoHasta: '2015-01-03',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(r.erroresPorPunto).toEqual({})
    expect(r.seriesPorPunto).toEqual({ p1: [0, 5] })
    // Arma la URL del endpoint de inundación (GloFAS), no la de pronóstico.
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const url = fetchImpl.mock.calls[0][0] as unknown as string
    expect(url).toContain('/v1/flood?latitude=-27.49&longitude=-56.8')
    expect(url).toContain('daily=river_discharge')
  })

  it('un punto sin datos (serie vacía) no bloquea a los demás', async () => {
    const puntos = [puntoFake('p0', -1, 10), puntoFake('p1', -1, 11), puntoFake('p2', -1, 12)]
    const fetchImpl = fetchOk([
      { daily: { time: ['2015-01-01'], river_discharge: [10] } },
      { daily: { time: ['2015-01-01'], river_discharge: [null] } },
      { daily: { time: ['2015-01-01'], river_discharge: [12] } },
    ])

    const { seriesPorPunto, erroresPorPunto } = await obtenerSeriesHistoricasCaudal({
      puntos,
      periodoDesde: '2015-01-01',
      periodoHasta: '2015-01-01',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(erroresPorPunto).toEqual({})
    expect(seriesPorPunto.p0).toEqual([10])
    expect(seriesPorPunto.p1).toEqual([])
    expect(seriesPorPunto.p2).toEqual([12])
  })

  it('agrupa por TAMANO_LOTE_COORDENADAS_CAUDAL y un lote caído no pierde los exitosos', async () => {
    const total = TAMANO_LOTE_COORDENADAS_CAUDAL + 10
    const puntos = Array.from({ length: total }, (_, i) => puntoFake(`p-${i}`, -27, i))

    const fetchImpl = vi.fn(async (url: string) => {
      const longitudes = (new URL(url).searchParams.get('longitude') ?? '').split(',').map(Number)
      // El lote que arranca en lon 50 falla siempre.
      if (longitudes[0] === TAMANO_LOTE_COORDENADAS_CAUDAL) {
        return new Response('boom', { status: 500 })
      }
      return new Response(
        JSON.stringify(
          longitudes.map((lon) => ({
            daily: { time: ['2015-01-01', '2015-01-02'], river_discharge: [lon, null] },
          })),
        ),
        { status: 200 },
      )
    })

    const { seriesPorPunto, erroresPorPunto } = await obtenerSeriesHistoricasCaudal({
      puntos,
      periodoDesde: '2015-01-01',
      periodoHasta: '2015-01-02',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    // Dos lotes lógicos (0..49 y 50..59); el lote caído se reintenta, así que
    // se comparan las longitudes iniciales distintas en vez del total de llamadas.
    const longitudesIniciales = fetchImpl.mock.calls.map((call) =>
      (new URL(call[0] as unknown as string).searchParams.get('longitude') ?? '').split(',')[0],
    )
    expect(new Set(longitudesIniciales)).toEqual(new Set(['0', '50']))
    // El lote caído (10 puntos) queda con error y el exitoso (50) devuelve datos.
    expect(Object.keys(erroresPorPunto)).toHaveLength(10)
    expect(erroresPorPunto[`p-${TAMANO_LOTE_COORDENADAS_CAUDAL}`].motivo).toBe('http_error')
    expect(Object.keys(seriesPorPunto)).toHaveLength(TAMANO_LOTE_COORDENADAS_CAUDAL)
    expect(seriesPorPunto['p-0']).toEqual([0])
    expect(seriesPorPunto[`p-${TAMANO_LOTE_COORDENADAS_CAUDAL - 1}`]).toEqual([
      TAMANO_LOTE_COORDENADAS_CAUDAL - 1,
    ])
  }, 15_000)
})
