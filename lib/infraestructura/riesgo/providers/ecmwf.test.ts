import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { crearProviderEcmwf } from './ecmwf'

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
})
