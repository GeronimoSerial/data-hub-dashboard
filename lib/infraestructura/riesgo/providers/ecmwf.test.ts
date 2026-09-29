import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { crearProviderEcmwf, TAMANO_LOTE_COORDENADAS } from './ecmwf'
import { longitudesDeUrl } from './__fixtures__/url'
import type { HazardForecastPunto } from '../tipos-hazard'

const fixtureJson = JSON.parse(
  readFileSync(
    new URL('../__fixtures__/hazard/ecmwf-forecast-2026-09-26.json', import.meta.url),
    'utf8',
  ),
) as unknown

function fetchFixture() {
  return vi.fn(async (_url: string) => new Response(JSON.stringify(fixtureJson), { status: 200 }))
}

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
    const fetchImpl = fetchFixture()
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
    const provider = crearProviderEcmwf({ fetchImpl: fetchFixture() as unknown as typeof fetch })
    const puntos = await provider.obtenerPronostico({ geometryRefs: [GEOMETRY], ahora: AHORA })

    const primeros = puntos.filter((p) => p.horizonteHoras <= 5)
    expect(primeros.length).toBeGreaterThan(0)
    for (const punto of primeros) {
      expect(punto.pasoHoras).toBe(1)
    }
  })

  it('no emite horizontes negativos cuando ahora es anterior al primer timestamp', async () => {
    const provider = crearProviderEcmwf({ fetchImpl: fetchFixture() as unknown as typeof fetch })
    const puntos = await provider.obtenerPronostico({ geometryRefs: [GEOMETRY], ahora: AHORA })

    expect(puntos.length).toBeGreaterThan(0)
    expect(puntos.every((p) => p.horizonteHoras >= 0)).toBe(true)
    expect(puntos.some((p) => p.horizonteHoras === 0)).toBe(true)
  })

  it('completa validoEn como ISO UTC y conserva geometryRef/corridaEn', async () => {
    const provider = crearProviderEcmwf({ fetchImpl: fetchFixture() as unknown as typeof fetch })
    const puntos = await provider.obtenerPronostico({ geometryRefs: [GEOMETRY], ahora: AHORA })

    const muestra = puntos[0]
    expect(muestra.geometryRef).toBe(GEOMETRY)
    expect(muestra.corridaEn).toBe(AHORA.toISOString())
    expect(muestra.validoEn.endsWith('Z')).toBe(true)
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
    const fetchImpl = vi.fn(async (url: string) => {
      const longitudes = longitudesDeUrl(url)
      return new Response(JSON.stringify(payloadEcmwfParaLongitudes(longitudes)), { status: 200 })
    })
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
    const fetchImpl = vi.fn(async (url: string) => {
      const longitudes = longitudesDeUrl(url)
      return new Response(JSON.stringify(payloadEcmwfParaLongitudes(longitudes)), { status: 200 })
    })
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
})
