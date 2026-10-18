import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { crearProviderEcmwf, TAMANO_LOTE_COORDENADAS, TIMEOUT_MS_ECMWF } from './ecmwf'
import { longitudesDeUrl } from './__fixtures__/url'
import { fetchOk, fetchJsonPorUrl } from './__fixtures__/fetch'
import type { HazardForecastPunto } from '../tipos-hazard'

const fixtureJson = JSON.parse(
  readFileSync(
    new URL('../__fixtures__/hazard/ecmwf-forecast-2026-09-26.json', import.meta.url),
    'utf8',
  ),
) as unknown

const AHORA = new Date('2026-09-26T00:00:00Z')
const GEOMETRY = '-27.5_-58.8'

// Respuesta sintética por lote: un objeto por coordenada pedida, en el mismo
// orden, con la precipitación codificando la longitud de esa coordenada. El
// latitude/longitude del cuerpo es un señuelo a propósito: el provider debe
// emparejar por POSICIÓN, no por el lat/lon que devuelve la API.
function payloadEcmwfParaLongitudes(longitudes: number[]) {
  return longitudes.map((lon) => ({
    latitude: 999,
    longitude: 999,
    hourly: {
      time: ['2026-09-26T00:00', '2026-09-26T01:00'],
      precipitation: [lon, lon],
      cape: [0, 0],
      wind_gusts_10m: [0, 0],
      temperature_2m: [0, 0],
      wind_speed_10m: [0, 0],
    },
  }))
}

function precipitacionPorRef(puntos: HazardForecastPunto[]): Map<string, number[]> {
  const mapa = new Map<string, number[]>()
  for (const punto of puntos) {
    if (punto.variable !== 'precipitacion') continue
    const valores = mapa.get(punto.geometryRef) ?? []
    valores.push(punto.valor)
    mapa.set(punto.geometryRef, valores)
  }
  return mapa
}

// Celdas "lat_lon" únicas y parseables: lat fija, lon = índice 0..cantidad-1.
function celdasSinteticas(cantidad: number): string[] {
  return Array.from({ length: cantidad }, (_, indice) => `-27_${indice}`)
}

describe('crearProviderEcmwf', () => {
  it('expone el nombre de proveedor open-meteo-ecmwf', () => {
    expect(crearProviderEcmwf().nombreProveedor).toBe('open-meteo-ecmwf')
  })

  it('genera puntos para las cinco variables usando fetchImpl inyectado', async () => {
    const fetchImpl = fetchOk(fixtureJson)
    const provider = crearProviderEcmwf({ fetchImpl: fetchImpl as unknown as typeof fetch })

    const puntos = await provider.obtenerPronostico({ geometryRefs: [GEOMETRY], ahora: AHORA })

    expect(puntos.length).toBeGreaterThan(0)
    const variables = new Set(puntos.map((p) => p.variable))
    expect(variables).toEqual(
      new Set(['precipitacion', 'cape', 'rafagas', 'temperatura', 'viento']),
    )
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl.mock.calls[0][0]).toContain('latitude=-27.5')
    expect(fetchImpl.mock.calls[0][0]).toContain('longitude=-58.8')
  })

  it('deriva el paso real: 1h en las primeras horas del array', async () => {
    const provider = crearProviderEcmwf({ fetchImpl: fetchOk(fixtureJson) as unknown as typeof fetch })
    const puntos = await provider.obtenerPronostico({ geometryRefs: [GEOMETRY], ahora: AHORA })

    const primeros = puntos.filter((p) => p.horizonteHoras <= 5)
    expect(primeros.length).toBeGreaterThan(0)
    for (const punto of primeros) {
      expect(punto.pasoHoras).toBe(1)
    }
  })

  it('no emite horizontes negativos cuando ahora es anterior al primer timestamp', async () => {
    const provider = crearProviderEcmwf({ fetchImpl: fetchOk(fixtureJson) as unknown as typeof fetch })
    const puntos = await provider.obtenerPronostico({ geometryRefs: [GEOMETRY], ahora: AHORA })

    expect(puntos.length).toBeGreaterThan(0)
    expect(puntos.every((p) => p.horizonteHoras >= 0)).toBe(true)
    expect(puntos.some((p) => p.horizonteHoras === 0)).toBe(true)
  })

  it('completa validoEn como ISO UTC y conserva geometryRef/corridaEn', async () => {
    const provider = crearProviderEcmwf({ fetchImpl: fetchOk(fixtureJson) as unknown as typeof fetch })
    const puntos = await provider.obtenerPronostico({ geometryRefs: [GEOMETRY], ahora: AHORA })

    const muestra = puntos[0]
    expect(muestra.geometryRef).toBe(GEOMETRY)
    expect(muestra.corridaEn).toBe(AHORA.toISOString())
    expect(muestra.validoEn.endsWith('Z')).toBe(true)
  })

  it('pide forecast_hours=264 (no forecast_days) para cubrir 240 h desde cualquier hora de ingesta', async () => {
    const fetchImpl = fetchOk(fixtureJson)
    const provider = crearProviderEcmwf({ fetchImpl: fetchImpl as unknown as typeof fetch })

    await provider.obtenerPronostico({ geometryRefs: [GEOMETRY], ahora: AHORA })

    const url = fetchImpl.mock.calls[0][0] as string
    expect(url).toContain('forecast_hours=264')
    expect(url).not.toContain('forecast_days')
  })

  it('diagnóstico: un fetch que rechaza deja la celda en erroresPorCelda y puntos vacío', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('boom de red')
    })
    const provider = crearProviderEcmwf({ fetchImpl: fetchImpl as unknown as typeof fetch })

    const { puntos, erroresPorCelda } = await provider.obtenerPronosticoConDiagnostico({
      geometryRefs: [GEOMETRY],
      ahora: AHORA,
    })

    expect(puntos).toEqual([])
    expect(erroresPorCelda[GEOMETRY]).toContain('http_error')
    expect(erroresPorCelda[GEOMETRY]).toContain('boom de red')
  }, 15_000)

  it('agrupa 120 celdas en ceil(120/TAMANO_LOTE_COORDENADAS) llamadas y empareja por índice', async () => {
    const fetchImpl = fetchJsonPorUrl((url) => payloadEcmwfParaLongitudes(longitudesDeUrl(url)))
    const provider = crearProviderEcmwf({ fetchImpl: fetchImpl as unknown as typeof fetch })

    const celdas = celdasSinteticas(120)
    const { puntos, erroresPorCelda, llamadasRealizadas, celdasPorLlamada } =
      await provider.obtenerPronosticoConDiagnostico({ geometryRefs: celdas, ahora: AHORA })

    expect(fetchImpl).toHaveBeenCalledTimes(Math.ceil(120 / TAMANO_LOTE_COORDENADAS))
    expect(llamadasRealizadas).toBe(Math.ceil(120 / TAMANO_LOTE_COORDENADAS))
    expect(celdasPorLlamada).toEqual([50, 50, 20])
    expect(erroresPorCelda).toEqual({})

    const precipPorRef = precipitacionPorRef(puntos)
    expect(precipPorRef.size).toBe(120)
    for (let indice = 0; indice < 120; indice++) {
      const valores = precipPorRef.get(`-27_${indice}`)
      expect(valores).toEqual([indice, indice])
    }
  })

  it('asigna cada objeto del array a la celda correcta por posición', async () => {
    const fetchImpl = fetchJsonPorUrl((url) => payloadEcmwfParaLongitudes(longitudesDeUrl(url)))
    const provider = crearProviderEcmwf({ fetchImpl: fetchImpl as unknown as typeof fetch })

    const celdas = ['-27_7', '-27_8', '-27_9']
    const { puntos } = await provider.obtenerPronosticoConDiagnostico({
      geometryRefs: celdas,
      ahora: AHORA,
    })

    const precipPorRef = precipitacionPorRef(puntos)
    expect(precipPorRef.get('-27_7')).toEqual([7, 7])
    expect(precipPorRef.get('-27_8')).toEqual([8, 8])
    expect(precipPorRef.get('-27_9')).toEqual([9, 9])
  }, 15_000)

  it('un lote caído no pierde los lotes exitosos', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      const longitudes = longitudesDeUrl(url)
      // El lote cuyo primer lon es 50 (celdas 50..99) falla siempre.
      if (longitudes[0] === 50) {
        return new Response('boom', { status: 500 })
      }
      return new Response(JSON.stringify(payloadEcmwfParaLongitudes(longitudes)), { status: 200 })
    })
    const provider = crearProviderEcmwf({ fetchImpl: fetchImpl as unknown as typeof fetch })

    const celdas = celdasSinteticas(120)
    const { puntos, erroresPorCelda, llamadasRealizadas, celdasPorLlamada } =
      await provider.obtenerPronosticoConDiagnostico({ geometryRefs: celdas, ahora: AHORA })

    expect(llamadasRealizadas).toBe(3)
    expect(celdasPorLlamada).toEqual([50, 50, 20])

    const refsConError = Object.keys(erroresPorCelda)
    expect(refsConError).toHaveLength(50)
    expect(refsConError.every((ref) => ref.startsWith('-27_') && Number(ref.slice(4)) >= 50)).toBe(
      true,
    )
    expect(refsConError.every((ref) => Number(ref.slice(4)) <= 99)).toBe(true)
    expect(Object.values(erroresPorCelda).every((detalle) => detalle.includes('http_error'))).toBe(
      true,
    )

    const precipPorRef = precipitacionPorRef(puntos)
    expect(precipPorRef.size).toBe(70)
    expect(precipPorRef.get('-27_0')).toEqual([0, 0])
    expect(precipPorRef.get('-27_49')).toEqual([49, 49])
    expect(precipPorRef.get('-27_50')).toBeUndefined()
    expect(precipPorRef.get('-27_99')).toBeUndefined()
    expect(precipPorRef.get('-27_100')).toEqual([100, 100])
    expect(precipPorRef.get('-27_119')).toEqual([119, 119])
  }, 15_000)
  it('un 429 corta los lotes restantes: no se consultan y quedan con rate_limited', async () => {
    const fetchImpl = vi.fn(async () => new Response('Minutely API request limit exceeded', { status: 429 }))
    const reservas: number[] = []
    const provider = crearProviderEcmwf({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      controladorCupoFactory: (peso) => ({
        reservar: async () => {
          reservas.push(peso)
          return { ok: true, esperoMs: 0 }
        },
        registrar429: async () => {},
      }),
    })

    const { puntos, erroresPorCelda, llamadasRealizadas } = await provider.obtenerPronosticoConDiagnostico({
      geometryRefs: celdasSinteticas(120),
      ahora: AHORA,
    })

    // Primer lote: un único request (429 sin reintento); los otros dos lotes
    // no tocan la red ni reservan cupo.
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(reservas).toHaveLength(1)
    expect(llamadasRealizadas).toBe(1)
    expect(puntos).toEqual([])
    expect(Object.keys(erroresPorCelda)).toHaveLength(120)
    expect(Object.values(erroresPorCelda).every((detalle) => detalle.startsWith('rate_limited'))).toBe(true)
  })
  it('consulta una sola vez cada punto de grilla de 0,25° y replica la serie a sus celdas', async () => {
    // Tres celdas de 0,1° en el punto -27.5_-58.75 y una en -28_-58.
    const fetchImpl = vi.fn(async (url: string) => {
      const latitudes = (new URL(url).searchParams.get('latitude') ?? '').split(',').map(Number)
      const longitudes = longitudesDeUrl(url)
      const cuerpo = longitudes.map((lon, indice) => ({
        latitude: Math.round(latitudes[indice] * 4) / 4,
        longitude: Math.round(lon * 4) / 4,
        hourly: { ...payloadEcmwfParaLongitudes([lon])[0].hourly },
      }))
      return new Response(JSON.stringify(cuerpo), { status: 200 })
    })
    const provider = crearProviderEcmwf({ fetchImpl: fetchImpl as unknown as typeof fetch })

    const celdas = ['-27.4_-58.8', '-28.0_-58.0', '-27.5_-58.7', '-27.6_-58.8']
    const { puntos, erroresPorCelda, llamadasRealizadas, celdasPorLlamada } =
      await provider.obtenerPronosticoConDiagnostico({ geometryRefs: celdas, ahora: AHORA })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(longitudesDeUrl(fetchImpl.mock.calls[0][0])).toEqual([-58.8, -58])
    expect(llamadasRealizadas).toBe(1)
    expect(celdasPorLlamada).toEqual([2])
    expect(erroresPorCelda).toEqual({})

    // Misma forma y contenido por celda que si se hubiera pedido cada una: la
    // del representante, con su propio geometryRef.
    const filasDe = (ref: string) =>
      puntos.filter((p) => p.geometryRef === ref).map(({ geometryRef: _ref, ...resto }) => resto)
    expect(filasDe('-27.4_-58.8')).toHaveLength(10)
    expect(filasDe('-27.5_-58.7')).toEqual(filasDe('-27.4_-58.8'))
    expect(filasDe('-27.6_-58.8')).toEqual(filasDe('-27.4_-58.8'))
    expect(precipitacionPorRef(puntos).get('-28.0_-58.0')).toEqual([-58, -58])
  })

  it('si Open-Meteo devuelve otro punto para el representante, consulta al resto por separado', async () => {
    let llamada = 0
    const fetchImpl = vi.fn(async (url: string) => {
      llamada++
      const longitudes = longitudesDeUrl(url)
      const cuerpo = payloadEcmwfParaLongitudes(longitudes).map((elemento) => ({
        ...elemento,
        // 1ra llamada: el punto devuelto no es -27.5_-58.75 (cell_selection=land).
        latitude: llamada === 1 ? -27.75 : 999,
        longitude: -58.75,
      }))
      return new Response(JSON.stringify(cuerpo), { status: 200 })
    })
    const provider = crearProviderEcmwf({ fetchImpl: fetchImpl as unknown as typeof fetch })

    const { puntos, erroresPorCelda, llamadasRealizadas } = await provider.obtenerPronosticoConDiagnostico({
      geometryRefs: ['-27.4_-58.8', '-27.5_-58.7', '-27.6_-58.75'],
      ahora: AHORA,
    })

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(longitudesDeUrl(fetchImpl.mock.calls[1][0])).toEqual([-58.7, -58.75])
    expect(llamadasRealizadas).toBe(2)
    expect(erroresPorCelda).toEqual({})
    const precip = precipitacionPorRef(puntos)
    expect(precip.get('-27.4_-58.8')).toEqual([-58.8, -58.8])
    expect(precip.get('-27.5_-58.7')).toEqual([-58.7, -58.7])
    expect(precip.get('-27.6_-58.75')).toEqual([-58.75, -58.75])
  })
  it('espera hasta 30 s una respuesta lenta en vez de cortarla a los 10 s y reintentar', async () => {
    vi.useFakeTimers()
    try {
      const fetchImpl = vi.fn(
        (url: string) =>
          new Promise<Response>((resolve) => {
            const cuerpo = JSON.stringify(payloadEcmwfParaLongitudes(longitudesDeUrl(url)))
            setTimeout(() => resolve(new Response(cuerpo)), 20_000)
          }),
      )
      const provider = crearProviderEcmwf({ fetchImpl: fetchImpl as unknown as typeof fetch })
      const promesa = provider.obtenerPronosticoConDiagnostico({ geometryRefs: ['-27_0'], ahora: AHORA })
      await vi.advanceTimersByTimeAsync(20_000)
      const { erroresPorCelda } = await promesa

      expect(erroresPorCelda).toEqual({})
      expect(fetchImpl).toHaveBeenCalledTimes(1)
      expect(TIMEOUT_MS_ECMWF).toBe(30_000)
    } finally {
      vi.useRealTimers()
    }
  })
})
