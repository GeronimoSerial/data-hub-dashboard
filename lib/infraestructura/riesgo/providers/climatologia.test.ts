import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import {
  agruparPuntosPorEra5,
  calcularPercentilesPrecipitacion,
  estimarCostoClimatologia,
  obtenerSerieHistorica,
  obtenerSeriesHistoricas,
  redondearACeldaEra5,
  TAMANO_LOTE_COORDENADAS,
} from './climatologia'
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
    // Arma la URL del archivo histórico de Open-Meteo. La coordenada llega
    // REDONDEADA a la celda ERA5 (-27.52 -> -27.5, -58.76 -> -58.75, ver
    // "Deduplicación por celda ERA5" en climatologia.ts): es intencional,
    // ERA5 no tiene más resolución nativa que 0.25°.
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const url = fetchImpl.mock.calls[0][0] as unknown as string
    expect(url).toContain('/v1/archive?latitude=-27.5&longitude=-58.75')
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

describe('obtenerSeriesHistoricas (por lotes)', () => {
  // Un objeto por coordenada pedida, en el mismo orden, con la precipitación
  // del primer día codificando la longitud. El day 2 es null para confirmar
  // que se descarta. latitude/longitude del cuerpo es señuelo: el parseo debe
  // emparejar por POSICIÓN.
  function payloadArchivoParaLongitudes(longitudes: number[]) {
    return longitudes.map((lon) => ({
      latitude: 999,
      longitude: 999,
      daily: { time: ['2020-01-01', '2020-01-02'], precipitation_sum: [lon, null] },
    }))
  }

  function longitudesDeUrl(url: string): number[] {
    return (new URL(url).searchParams.get('longitude') ?? '').split(',').map(Number)
  }

  function puntosSinteticos(cantidad: number) {
    return Array.from({ length: cantidad }, (_, indice) => ({
      geometryRef: `-27_${indice}`,
      lat: -27,
      lon: indice,
    }))
  }

  it('agrupa 120 celdas en ceil(120/TAMANO_LOTE_COORDENADAS) llamadas y empareja por índice', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      const longitudes = longitudesDeUrl(url)
      return new Response(JSON.stringify(payloadArchivoParaLongitudes(longitudes)), { status: 200 })
    })

    const { seriesPorCelda, erroresPorCelda, llamadasRealizadas, celdasPorLlamada } =
      await obtenerSeriesHistoricas({
        puntos: puntosSinteticos(120),
        periodoDesde: '1991-01-01',
        periodoHasta: '2020-12-31',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      })

    expect(fetchImpl).toHaveBeenCalledTimes(Math.ceil(120 / TAMANO_LOTE_COORDENADAS))
    expect(llamadasRealizadas).toBe(Math.ceil(120 / TAMANO_LOTE_COORDENADAS))
    expect(celdasPorLlamada).toEqual([50, 50, 20])
    expect(erroresPorCelda).toEqual({})

    expect(Object.keys(seriesPorCelda)).toHaveLength(120)
    for (let indice = 0; indice < 120; indice++) {
      expect(seriesPorCelda[`-27_${indice}`]).toEqual([indice])
    }
  })

  it('asigna cada objeto del array a la celda correcta por posición', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      const longitudes = longitudesDeUrl(url)
      return new Response(JSON.stringify(payloadArchivoParaLongitudes(longitudes)), { status: 200 })
    })

    const { seriesPorCelda } = await obtenerSeriesHistoricas({
      puntos: puntosSinteticos(3),
      periodoDesde: '2020-01-01',
      periodoHasta: '2020-01-02',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(seriesPorCelda['-27_0']).toEqual([0])
    expect(seriesPorCelda['-27_1']).toEqual([1])
    expect(seriesPorCelda['-27_2']).toEqual([2])
  }, 15_000)

  it('un lote caído no pierde los lotes exitosos', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      const longitudes = longitudesDeUrl(url)
      // El lote cuyo primer lon es 50 (celdas 50..99) falla siempre.
      if (longitudes[0] === 50) {
        return new Response('boom', { status: 500 })
      }
      return new Response(JSON.stringify(payloadArchivoParaLongitudes(longitudes)), { status: 200 })
    })

    const { seriesPorCelda, erroresPorCelda, llamadasRealizadas, celdasPorLlamada } =
      await obtenerSeriesHistoricas({
        puntos: puntosSinteticos(120),
        periodoDesde: '1991-01-01',
        periodoHasta: '2020-12-31',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      })

    expect(llamadasRealizadas).toBe(3)
    expect(celdasPorLlamada).toEqual([50, 50, 20])

    const refsConError = Object.keys(erroresPorCelda)
    expect(refsConError).toHaveLength(50)
    expect(refsConError.every((ref) => Number(ref.slice(4)) >= 50)).toBe(true)
    expect(refsConError.every((ref) => Number(ref.slice(4)) <= 99)).toBe(true)
    expect(erroresPorCelda['-27_50'].motivo).toBe('http_error')

    expect(Object.keys(seriesPorCelda)).toHaveLength(70)
    expect(seriesPorCelda['-27_0']).toEqual([0])
    expect(seriesPorCelda['-27_49']).toEqual([49])
    expect(seriesPorCelda['-27_50']).toBeUndefined()
    expect(seriesPorCelda['-27_99']).toBeUndefined()
    expect(seriesPorCelda['-27_100']).toEqual([100])
    expect(seriesPorCelda['-27_119']).toEqual([119])
  }, 15_000)
})

describe('redondearACeldaEra5 / agruparPuntosPorEra5 (deduplicación por celda ERA5)', () => {
  it('redondea al múltiplo de 0.25 más cercano', () => {
    expect(redondearACeldaEra5(-27.4)).toBeCloseTo(-27.5, 10)
    expect(redondearACeldaEra5(-27.5)).toBeCloseTo(-27.5, 10)
    expect(redondearACeldaEra5(-58.76)).toBeCloseTo(-58.75, 10)
    expect(redondearACeldaEra5(0)).toBe(0)
    expect(redondearACeldaEra5(10)).toBe(10)
  })

  it('agrupa varios puntos de 0.1° que caen en la misma celda ERA5 (~0.25°) en un único grupo', () => {
    // -27.40, -27.42, -27.49 redondean los tres a -27.50 (0.25 más cercano);
    // -27.60 redondea a -27.50 también (distancia 0.10 vs 0.25 al próximo
    // múltiplo -27.75); -27.90 cae en un grupo aparte (-27.75... en realidad
    // más cerca de -28.0 — se verifica abajo con el valor real).
    const puntos = [
      { geometryRef: 'a', lat: -27.4, lon: -58.8 },
      { geometryRef: 'b', lat: -27.42, lon: -58.78 },
      { geometryRef: 'c', lat: -27.49, lon: -58.76 },
      { geometryRef: 'd', lat: -10, lon: -60 },
    ]

    const grupos = agruparPuntosPorEra5(puntos)

    // a, b, c comparten la misma celda ERA5 (todas redondean a -27.5 / -58.75
    // ó -58.75 según el caso: lo importante es que colapsan en UN grupo).
    const grupoABC = grupos.find((g) => g.miembros.includes('a'))
    expect(grupoABC?.miembros.sort()).toEqual(['a', 'b', 'c'])
    expect(grupoABC?.miembros).toContain('b')
    expect(grupoABC?.miembros).toContain('c')

    // d está lejos (-10, -60): su propio grupo, no comparte con a/b/c.
    const grupoD = grupos.find((g) => g.miembros.includes('d'))
    expect(grupoD?.miembros).toEqual(['d'])

    expect(grupos).toHaveLength(2)
  })

  it('un solo punto produce un grupo con un solo miembro (sin dedup posible)', () => {
    const grupos = agruparPuntosPorEra5([{ geometryRef: 'x', lat: 1.23, lon: 4.56 }])
    expect(grupos).toHaveLength(1)
    expect(grupos[0].miembros).toEqual(['x'])
  })
})

// Misma fórmula que `diasEntreFechas` (no exportada) en climatologia.ts, para
// no hardcodear un conteo de días que dependa de asumir la cuenta exacta.
function diasEntreFechasTest(desde: string, hasta: string): number {
  const msPorDia = 86_400_000
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / msPorDia) + 1
}

describe('estimarCostoClimatologia', () => {
  it('coincide con la fórmula de pesoLlamada para 1 variable', () => {
    const dias = diasEntreFechasTest('1991-01-01', '2020-12-31')
    const factorDias = Math.max(1, dias / 14)

    const costo387SinDedup = estimarCostoClimatologia({
      celdasEra5Unicas: 387,
      periodoDesde: '1991-01-01',
      periodoHasta: '2020-12-31',
    })
    expect(costo387SinDedup).toBeCloseTo(387 * factorDias, 6)
    expect(costo387SinDedup).toBeGreaterThan(300_000) // supera el techo duro mensual sin deduplicar

    // Con dedup (ej. 62 celdas ERA5 únicas en vez de 387) el costo baja
    // proporcionalmente y entra cómodo en el techo mensual.
    const costoDeduplicado = estimarCostoClimatologia({
      celdasEra5Unicas: 62,
      periodoDesde: '1991-01-01',
      periodoHasta: '2020-12-31',
    })
    expect(costoDeduplicado).toBeCloseTo(62 * factorDias, 6)
    expect(costoDeduplicado).toBeLessThan(300_000)
  })

  it('escala linealmente en celdasEra5Unicas (misma fórmula que pesoLlamada)', () => {
    const costo1 = estimarCostoClimatologia({
      celdasEra5Unicas: 1,
      periodoDesde: '2020-01-01',
      periodoHasta: '2020-01-14',
    })
    const costo10 = estimarCostoClimatologia({
      celdasEra5Unicas: 10,
      periodoDesde: '2020-01-01',
      periodoHasta: '2020-01-14',
    })
    expect(costo10).toBeCloseTo(costo1 * 10, 6)
  })
})

describe('obtenerSeriesHistoricas: resultado idéntico al enfoque celda-por-celda', () => {
  it('dos geometryRef que caen en la misma celda ERA5 reciben la MISMA serie que pedirla por separado (una sola request HTTP, no dos)', async () => {
    const fixtureUrl = new URL('../__fixtures__/hazard/era5-archive-2020q1.json', import.meta.url)
    const fixture = JSON.parse(readFileSync(fixtureUrl, 'utf8')) as {
      daily: { time: string[]; precipitation_sum: Array<number | null> }
    }
    const esperado = fixture.daily.precipitation_sum.filter((v) => v !== null) as number[]

    // Dos celdas de 0.1° distintas (geometryRef distinto) cuyas coordenadas
    // redondean a la MISMA celda ERA5 que usa el fixture (-27.52 -> -27.50,
    // -58.76 -> -58.75): -27.55/-58.7 y -27.48/-58.8 redondean igual.
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(fixture), { status: 200 }))

    const resultado = await obtenerSeriesHistoricas({
      puntos: [
        { geometryRef: 'celda-1', lat: -27.55, lon: -58.7 },
        { geometryRef: 'celda-2', lat: -27.48, lon: -58.8 },
      ],
      periodoDesde: '2020-01-01',
      periodoHasta: '2020-03-31',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    // Una sola request HTTP para ambas celdas (deduplicadas en 1 celda ERA5),
    // no dos como haría el enfoque celda-por-celda anterior.
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(resultado.celdasEra5Unicas).toBe(1)
    expect(resultado.puntosOriginales).toBe(2)

    // Ambas celdas reciben exactamente la misma serie (la del fixture): el
    // resultado NO pierde precisión frente a pedirlas una por una, porque es
    // literalmente el mismo dato de grilla ERA5 subyacente.
    expect(resultado.seriesPorCelda['celda-1']).toEqual(esperado)
    expect(resultado.seriesPorCelda['celda-2']).toEqual(esperado)
    expect(resultado.seriesPorCelda['celda-1']).toEqual(resultado.seriesPorCelda['celda-2'])
  })
})
