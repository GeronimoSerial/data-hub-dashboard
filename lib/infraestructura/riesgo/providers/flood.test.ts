import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { crearProviderFlood, obtenerPronosticoConDiagnostico } from './flood'
import { obtenerPuntosRio } from '../puntos-rio'

const FIXTURE = new URL(
  '../__fixtures__/hazard/flood-parana-corrientes-2026-09-26.json',
  import.meta.url,
)
const CUERPO_FIXTURE = readFileSync(FIXTURE, 'utf8')

// Fetch de test: lee la respuesta real guardada y la devuelve 200 para
// cualquier URL de la Flood API. Nunca golpea la red.
function fetchFixture() {
  return vi.fn(async (url: string | URL | Request) => {
    const texto = String(url)
    if (!texto.includes('flood-api.open-meteo.com')) {
      return new Response('no configurado', { status: 404 })
    }
    return new Response(CUERPO_FIXTURE, { status: 200 })
  })
}

const AHORA = new Date('2026-09-26T00:00:00Z')

describe('crearProviderFlood', () => {
  it('expone el nombre de proveedor esperado', () => {
    expect(crearProviderFlood().nombreProveedor).toBe('open-meteo-flood')
  })

  it('emite puntos de caudal para un id de obtenerPuntosRio() con valores razonables', async () => {
    const fetchImpl = fetchFixture()
    const provider = crearProviderFlood({ fetchImpl: fetchImpl as unknown as typeof fetch })
    const puntos = await provider.obtenerPronostico({
      geometryRefs: ['parana-corrientes-paso-patria'],
      ahora: AHORA,
    })

    expect(puntos.length).toBeGreaterThan(0)
    for (const punto of puntos) {
      expect(punto.variable).toBe('caudal')
      expect(punto.geometryRef).toBe('parana-corrientes-paso-patria')
      expect(punto.unidad).toBe('m3/s')
      expect(punto.corridaEn).toBe(AHORA.toISOString())
      expect(typeof punto.valor).toBe('number')
      expect(punto.valor).toBeGreaterThan(1000)
      expect(punto.horizonteHoras).toBeGreaterThanOrEqual(0)
    }
    // El fixture real trae 5 días diarios desde el 2026-09-26.
    expect(puntos).toHaveLength(5)
    expect(puntos[0]?.valor).toBeCloseTo(17740.9, 1)
  })

  it('un id inventado no genera puntos y queda en el diagnóstico', async () => {
    const fetchImpl = fetchFixture()
    const { puntos, erroresPorCelda } = await obtenerPronosticoConDiagnostico({
      geometryRefs: ['parana-corrientes-paso-patria', 'rio-inventado'],
      ahora: AHORA,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(puntos.every((p) => p.geometryRef === 'parana-corrientes-paso-patria')).toBe(true)
    expect(puntos).toHaveLength(5)
    expect(erroresPorCelda['rio-inventado']).toBe('punto_no_configurado')
    // Sólo se llamó una vez (el id inválido no dispara fetch).
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('todos los ids de obtenerPuntosRio() son resolubles por el provider', async () => {
    const fetchImpl = fetchFixture()
    const ids = obtenerPuntosRio().map((p) => p.id)
    const { puntos, erroresPorCelda } = await obtenerPronosticoConDiagnostico({
      geometryRefs: ids,
      ahora: AHORA,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(Object.keys(erroresPorCelda)).toHaveLength(0)
    expect(puntos).toHaveLength(ids.length * 5)
    expect(new Set(puntos.map((p) => p.geometryRef))).toEqual(new Set(ids))
  })

  it('descarta días con horizonte negativo cuando ahora es posterior', async () => {
    const fetchImpl = fetchFixture()
    // Un día después del inicio de la serie: el 2026-09-26 (horizonte -24 h)
    // debe descartarse.
    const { puntos } = await obtenerPronosticoConDiagnostico({
      geometryRefs: ['parana-corrientes-paso-patria'],
      ahora: new Date('2026-09-27T00:00:00Z'),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(puntos).toHaveLength(4)
    expect(puntos[0]?.horizonteHoras).toBe(0)
    expect(puntos[0]?.validoEn).toBe('2026-09-27T00:00:00Z')
  })
})
