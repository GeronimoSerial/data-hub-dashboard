import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { calcularPercentilesPrecipitacion, obtenerSerieHistorica } from './climatologia'
import type { HazardClimatologiaPunto } from '../tipos-hazard'

// Serie sintética conocida: 10 días secos (0 mm) + 10 días con lluvia
// {1..9, 100}. Se pasa desordenada a propósito para probar el orden interno.
// Ordenada ascendente: [0×10, 1, 2, 3, 4, 5, 6, 7, 8, 9, 100]  (n = 20)
//
// Percentiles esperados (método: ceil(p/100 * n) - 1, clampeado):
//   todos_los_dias (n=20):
//     p90 -> ceil(18.0) - 1 = 17 -> 8
//     p95 -> ceil(19.0) - 1 = 18 -> 9
//     p99 -> ceil(19.8) - 1 = 19 -> 100
//   dias_humedos (filtra >= 1 mm -> [1..9, 100], n=10):
//     p90 -> ceil(9.0) - 1 = 8 -> 9
//     p95 -> ceil(9.5) - 1 = 9 -> 100
//     p99 -> ceil(9.9) - 1 = 9 -> 100
const SERIE_SINTETICA = [3, 0, 100, 5, 0, 1, 0, 8, 2, 0, 9, 0, 4, 0, 6, 0, 7, 0, 0, 0]
const ESPERADOS = {
  todos_los_dias: { p90: 8, p95: 9, p99: 100 },
  dias_humedos: { p90: 9, p95: 100, p99: 100 },
} as const

function buscarFila(
  filas: HazardClimatologiaPunto[],
  muestra: HazardClimatologiaPunto['muestra'],
  percentil: HazardClimatologiaPunto['percentil'],
): HazardClimatologiaPunto {
  const fila = filas.find((f) => f.muestra === muestra && f.percentil === percentil)
  if (!fila) throw new Error(`No se encontró la fila ${muestra}/${percentil}`)
  return fila
}

describe('calcularPercentilesPrecipitacion', () => {
  it('calcula exactamente los percentiles conocidos de una serie sintética', () => {
    const filas = calcularPercentilesPrecipitacion({
      geometryRef: 'escuela-test',
      valoresDiarios: SERIE_SINTETICA,
      periodoDesde: '1991-01-01',
      periodoHasta: '2020-12-31',
    })

    expect(filas).toHaveLength(6)

    for (const muestra of ['todos_los_dias', 'dias_humedos'] as const) {
      for (const percentil of ['p90', 'p95', 'p99'] as const) {
        const fila = buscarFila(filas, muestra, percentil)
        expect(fila.valor).toBe(ESPERADOS[muestra][percentil])
        expect(fila.unidad).toBe('mm')
        expect(fila.variable).toBe('precipitacion_diaria')
        expect(fila.geometryRef).toBe('escuela-test')
        expect(fila.periodoDesde).toBe('1991-01-01')
        expect(fila.periodoHasta).toBe('2020-12-31')
      }
    }
  })

  it('no incluye la muestra dias_humedos cuando no hay ningún día >= 1 mm', () => {
    const filas = calcularPercentilesPrecipitacion({
      geometryRef: 'x',
      valoresDiarios: [0, 0.2, 0.8, 0],
      periodoDesde: 'a',
      periodoHasta: 'b',
    })

    expect(filas).toHaveLength(3)
    expect(filas.every((f) => f.muestra === 'todos_los_dias')).toBe(true)
  })
})

describe('obtenerSerieHistorica', () => {
  const fixtureUrl = new URL('../__fixtures__/hazard/era5-archive-2020q1.json', import.meta.url)
  const fixture = JSON.parse(readFileSync(fixtureUrl, 'utf8')) as {
    daily: { time: string[]; precipitation_sum: Array<number | null> }
  }

  function fetchOk(body: unknown) {
    return vi.fn(async (_url: string) => new Response(JSON.stringify(body), { status: 200 }))
  }

  it('devuelve ok:true con la serie no-null del fixture ERA5 2020Q1', async () => {
    const fetchImpl = fetchOk(fixture)
    const esperado = fixture.daily.precipitation_sum.filter((v) => v !== null) as number[]

    const r = await obtenerSerieHistorica({
      lat: -27.52,
      lon: -58.76,
      periodoDesde: '2020-01-01',
      periodoHasta: '2020-03-31',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.valoresDiarios).toEqual(esperado)
      expect(r.valoresDiarios).toHaveLength(esperado.length)
      expect(r.valoresDiarios.every((v) => typeof v === 'number')).toBe(true)
    }
    // Arma la URL del archivo histórico de Open-Meteo.
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const url = fetchImpl.mock.calls[0][0] as unknown as string
    expect(url).toContain('/v1/archive?latitude=-27.52&longitude=-58.76')
    expect(url).toContain('daily=precipitation_sum')
  })

  it('descarta los días null en vez de imputarlos como 0 mm', async () => {
    const fetchImpl = fetchOk({
      daily: { time: ['2020-01-01', '2020-01-02', '2020-01-03'], precipitation_sum: [0, null, 5] },
    })

    const r = await obtenerSerieHistorica({
      lat: 0,
      lon: 0,
      periodoDesde: '2020-01-01',
      periodoHasta: '2020-01-03',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(r).toEqual({ ok: true, valoresDiarios: [0, 5] })
  })

  it('devuelve ok:false cuando la API responde 500', async () => {
    const fetchImpl = vi.fn(async () => new Response('boom', { status: 500 }))

    const r = await obtenerSerieHistorica({
      lat: -27.52,
      lon: -58.76,
      periodoDesde: '2020-01-01',
      periodoHasta: '2020-03-31',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toBe('http_error')
  })

  it('devuelve ok:false si daily.time y precipitation_sum tienen distinto largo', async () => {
    const fetchImpl = fetchOk({
      daily: { time: ['2020-01-01', '2020-01-02'], precipitation_sum: [1, 2, 3] },
    })

    const r = await obtenerSerieHistorica({
      lat: 0,
      lon: 0,
      periodoDesde: '2020-01-01',
      periodoHasta: '2020-01-02',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toBe('payload_invalido')
  })
})
