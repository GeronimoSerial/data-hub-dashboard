import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import {
  agruparPuntosPorEra5,
  calcularPercentilesPrecipitacion,
  diasMaximosPorTramo,
  estimarCostoClimatologia,
  obtenerSerieHistorica,
  obtenerSeriesHistoricas,
  partirPeriodoEnTramos,
  redondearACeldaEra5,
  TAMANO_LOTE_COORDENADAS,
} from './climatologia'
import { limiteVentana } from './cupo-om'
import type { HazardClimatologiaPunto } from '../tipos-hazard'
import { fetchOk, fetchJsonPorUrl } from './__fixtures__/fetch'
import { longitudesDeUrl } from './__fixtures__/url'

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
const fixtureEra5 = JSON.parse(
  readFileSync(new URL('../__fixtures__/hazard/era5-archive-2020q1.json', import.meta.url), 'utf8'),
) as { daily: { time: string[]; precipitation_sum: Array<number | null> } }

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
  it('devuelve ok:true con la serie no-null del fixture ERA5 2020Q1', async () => {
    const fetchImpl = fetchOk(fixtureEra5)
    const esperado = fixtureEra5.daily.precipitation_sum.filter((v) => v !== null) as number[]

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

  function puntosSinteticos(cantidad: number) {
    return Array.from({ length: cantidad }, (_, indice) => ({
      geometryRef: `-27_${indice}`,
      lat: -27,
      lon: indice,
    }))
  }

  // Período corto (2 días) a propósito: cae en UN solo tramo (ver
  // "troceo por período" más abajo), así que esta prueba aísla el batching
  // por CELDAS sin que el troceo por PERÍODO multiplique la cantidad de
  // llamadas — eso se prueba aparte.
  it('agrupa 120 celdas en ceil(120/TAMANO_LOTE_COORDENADAS) llamadas y empareja por índice', async () => {
    const fetchImpl = fetchJsonPorUrl((url) =>
      payloadArchivoParaLongitudes(longitudesDeUrl(url)),
    )

    const { seriesPorCelda, erroresPorCelda, llamadasRealizadas, celdasPorLlamada } =
      await obtenerSeriesHistoricas({
        puntos: puntosSinteticos(120),
        periodoDesde: '2020-01-01',
        periodoHasta: '2020-01-02',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      })

    const lotesEsperados = Math.ceil(120 / TAMANO_LOTE_COORDENADAS)
    expect(fetchImpl).toHaveBeenCalledTimes(lotesEsperados)
    expect(llamadasRealizadas).toBe(lotesEsperados)
    expect(celdasPorLlamada).toEqual(Array(lotesEsperados).fill(TAMANO_LOTE_COORDENADAS))
    expect(erroresPorCelda).toEqual({})

    expect(Object.keys(seriesPorCelda)).toHaveLength(120)
    for (let indice = 0; indice < 120; indice++) {
      expect(seriesPorCelda[`-27_${indice}`]).toEqual([indice])
    }
  })

  it('asigna cada objeto del array a la celda correcta por posición', async () => {
    const fetchImpl = fetchJsonPorUrl((url) =>
      payloadArchivoParaLongitudes(longitudesDeUrl(url)),
    )

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
      // El lote cuyo primer lon es 50 (celdas 50..54, un solo lote de
      // TAMANO_LOTE_COORDENADAS=5) falla siempre — sólo UN lote a propósito,
      // para no acumular el backoff real de `cliente-http.ts` (3 intentos
      // por lote caído) sobre muchos lotes y hacer lenta la prueba.
      if (longitudes[0] === 50) {
        return new Response('boom', { status: 500 })
      }
      return new Response(JSON.stringify(payloadArchivoParaLongitudes(longitudes)), { status: 200 })
    })

    const { seriesPorCelda, erroresPorCelda, llamadasRealizadas, celdasPorLlamada } =
      await obtenerSeriesHistoricas({
        puntos: puntosSinteticos(120),
        periodoDesde: '2020-01-01',
        periodoHasta: '2020-01-02',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      })

    const lotesEsperados = Math.ceil(120 / TAMANO_LOTE_COORDENADAS)
    // `http_error` no es un motivo "sin red": cada lote (exitoso o caído)
    // dispara igual una request HTTP real, así que los 24 cuentan.
    expect(llamadasRealizadas).toBe(lotesEsperados)
    expect(celdasPorLlamada).toEqual(Array(lotesEsperados).fill(TAMANO_LOTE_COORDENADAS))

    const refsConError = Object.keys(erroresPorCelda)
    expect(refsConError).toHaveLength(TAMANO_LOTE_COORDENADAS)
    expect(refsConError.every((ref) => Number(ref.slice(4)) >= 50)).toBe(true)
    expect(refsConError.every((ref) => Number(ref.slice(4)) < 50 + TAMANO_LOTE_COORDENADAS)).toBe(true)
    expect(erroresPorCelda['-27_50'].motivo).toBe('http_error')

    expect(Object.keys(seriesPorCelda)).toHaveLength(120 - TAMANO_LOTE_COORDENADAS)
    expect(seriesPorCelda['-27_0']).toEqual([0])
    expect(seriesPorCelda['-27_49']).toEqual([49])
    expect(seriesPorCelda['-27_50']).toBeUndefined()
    expect(seriesPorCelda['-27_100']).toEqual([100])
    expect(seriesPorCelda['-27_119']).toEqual([119])
  }, 15_000)
})

describe('troceo por período (OM-cupo, fix bloqueante 2da revisión)', () => {
  const LIMITE_MINUTO_DEFAULT = limiteVentana('minuto', false)

  it('diasMaximosPorTramo nunca produce un tramo cuyo peso supere el límite de minuto', () => {
    const dias = diasMaximosPorTramo({
      celdasPorLote: TAMANO_LOTE_COORDENADAS,
      variables: 1,
      limiteMinuto: LIMITE_MINUTO_DEFAULT,
    })
    expect(dias).toBeGreaterThanOrEqual(1)

    const factorDias = Math.max(1, dias / 14)
    const peso = TAMANO_LOTE_COORDENADAS * factorDias
    expect(peso).toBeLessThanOrEqual(LIMITE_MINUTO_DEFAULT)
  })

  it('diasMaximosPorTramo nunca devuelve menos de 1 día, incluso con un límite casi nulo', () => {
    expect(diasMaximosPorTramo({ celdasPorLote: 50, variables: 1, limiteMinuto: 1 })).toBe(1)
  })

  it('partirPeriodoEnTramos cubre el período completo sin huecos ni superposición', () => {
    const tramos = partirPeriodoEnTramos('2020-01-01', '2020-01-10', 3)
    expect(tramos).toEqual([
      { desde: '2020-01-01', hasta: '2020-01-03' },
      { desde: '2020-01-04', hasta: '2020-01-06' },
      { desde: '2020-01-07', hasta: '2020-01-09' },
      { desde: '2020-01-10', hasta: '2020-01-10' },
    ])
  })

  it('partirPeriodoEnTramos con un tramo más largo que el período entero devuelve un único tramo', () => {
    expect(partirPeriodoEnTramos('2020-01-01', '2020-01-05', 30)).toEqual([
      { desde: '2020-01-01', hasta: '2020-01-05' },
    ])
  })

  it('un período de 30 años se pide en varios tramos secuenciales y las series diarias quedan concatenadas en orden', async () => {
    const llamadas: Array<{ desde: string; hasta: string }> = []
    const fetchImpl = vi.fn(async (url: string) => {
      const u = new URL(url)
      const desde = u.searchParams.get('start_date') as string
      const hasta = u.searchParams.get('end_date') as string
      llamadas.push({ desde, hasta })
      // Cada tramo devuelve un único día cuyo valor codifica el índice del
      // tramo (orden de llegada), para poder verificar la concatenación.
      return new Response(
        JSON.stringify({ daily: { time: [desde], precipitation_sum: [llamadas.length] } }),
        { status: 200 },
      )
    })

    const resultado = await obtenerSeriesHistoricas({
      puntos: [{ geometryRef: 'una-celda', lat: -27, lon: -58 }],
      periodoDesde: '1991-01-01',
      periodoHasta: '2020-12-31',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    // Ninguna request individual pide el período completo (30 años): con 1
    // sola celda por lote (TAMANO_LOTE_COORDENADAS <= 5), un solo tramo de
    // 30 años pesaría ~782 (por encima del límite de minuto); acá deben ser
    // varios tramos más chicos.
    expect(fetchImpl.mock.calls.length).toBeGreaterThan(1)
    // Cubre el período completo sin huecos: el primer tramo arranca en la
    // fecha pedida y el último termina en ella.
    expect(llamadas[0].desde).toBe('1991-01-01')
    expect(llamadas[llamadas.length - 1].hasta).toBe('2020-12-31')

    expect(resultado.seriesPorCelda['una-celda']).toEqual(
      Array.from({ length: llamadas.length }, (_, indice) => indice + 1),
    )
  })

  it('un tramo caído a mitad de un lote no deja datos parciales: la celda entera queda en erroresPorCelda', async () => {
    const PERIODO_DESDE = '1991-01-01'
    const PERIODO_HASTA = '2020-12-31'
    const tramosEsperados = partirPeriodoEnTramos(
      PERIODO_DESDE,
      PERIODO_HASTA,
      diasMaximosPorTramo({ celdasPorLote: TAMANO_LOTE_COORDENADAS, variables: 1, limiteMinuto: LIMITE_MINUTO_DEFAULT }),
    )
    expect(tramosEsperados.length).toBeGreaterThanOrEqual(3)
    const fechaTramoQueFalla = tramosEsperados[1].desde

    // El 2do tramo (de varios) falla SIEMPRE con esa fecha de inicio — hace
    // que `ejecutarConReintentos` agote sus 3 intentos internos y devuelva
    // `http_error` de verdad, en vez de un 500 transitorio que un reintento
    // interno arreglaría solo. El resto de los tramos, si se llegaran a
    // pedir, responderían ok.
    const fetchImpl = vi.fn(async (url: string) => {
      const desde = new URL(url).searchParams.get('start_date')
      if (desde === fechaTramoQueFalla) return new Response('boom', { status: 500 })
      return new Response(JSON.stringify({ daily: { time: [desde as string], precipitation_sum: [1] } }), {
        status: 200,
      })
    })

    const resultado = await obtenerSeriesHistoricas({
      puntos: [{ geometryRef: 'una-celda', lat: -27, lon: -58 }],
      periodoDesde: PERIODO_DESDE,
      periodoHasta: PERIODO_HASTA,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(resultado.seriesPorCelda['una-celda']).toBeUndefined()
    expect(resultado.erroresPorCelda['una-celda']?.motivo).toBe('http_error')
    // No se siguió pidiendo tramos de este lote después del que falló (el
    // 3er tramo nunca se pide).
    const fechaTercerTramo = tramosEsperados[2].desde
    expect(fetchImpl.mock.calls.some((llamada) => llamada[0].includes(`start_date=${fechaTercerTramo}`))).toBe(false)
  }, 10_000)

  it('cupo_minuto_agotado corta el resto de los lotes igual que cupo_agotado/host_en_cooldown (fix del bloqueante)', async () => {
    let llamadas = 0
    const controladorCupoFactory = () => ({
      reservar: async () => {
        llamadas++
        return { ok: false as const, motivo: 'cupo_minuto_agotado' as const, detalle: 'fake: minuto agotado' }
      },
      registrar429: async () => {},
    })

    const resultado = await obtenerSeriesHistoricas({
      puntos: [
        { geometryRef: 'celda-1', lat: -27, lon: -58 },
        { geometryRef: 'celda-2', lat: -10, lon: -60 },
      ],
      periodoDesde: '1991-01-01',
      periodoHasta: '2020-12-31',
      fetchImpl: (async () => {
        throw new Error('no debería llegar a la red: la guarda de cupo corta antes')
      }) as unknown as typeof fetch,
      controladorCupoFactory,
    })

    // Sólo se reservó UNA vez: al chocar contra un motivo "sin red" en el
    // primer tramo, se corta el resto de los tramos/lotes sin seguir
    // intentando (mismo criterio que cupo_agotado/host_en_cooldown) — antes
    // del fix, `cupo_minuto_agotado` no estaba en MOTIVOS_CUPO_SIN_RED y el
    // caller seguía pidiendo tramos igual.
    expect(llamadas).toBe(1)
    expect(resultado.erroresPorCelda['celda-1']?.motivo).toBe('cupo_minuto_agotado')
    expect(resultado.erroresPorCelda['celda-2']?.motivo).toBe('cupo_minuto_agotado')
    expect(resultado.seriesPorCelda).toEqual({})
    expect(resultado.llamadasRealizadas).toBe(0)
  })
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
    const esperado = fixtureEra5.daily.precipitation_sum.filter((v) => v !== null) as number[]

    // Dos celdas de 0.1° distintas (geometryRef distinto) cuyas coordenadas
    // redondean a la MISMA celda ERA5 que usa el fixture (-27.52 -> -27.50,
    // -58.76 -> -58.75): -27.55/-58.7 y -27.48/-58.8 redondean igual.
    const fetchImpl = fetchOk(fixtureEra5)

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
