import { describe, expect, it } from 'vitest'
import corrida499 from '../__fixtures__/ina/corrida-499.json'
import corrida289 from '../__fixtures__/ina/corrida-289.json'
import { crearClienteA5 } from './cliente-a5'
import { ErrorPayloadA5 } from './parser-a5'
import { normalizarCorrida, parsearCorridaA5 } from './parser-pronostico-a5'
import { SERIES_PRONOSTICO_A5, SERIES_PRONOSTICO_VERSION, buscarSeriePronostico } from './series-pronostico-a5'

const clonar = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T

describe('series de pronóstico A5', () => {
  it('es un catálogo versionado sin duplicados y sólo asigna estaciones propias', () => {
    expect(SERIES_PRONOSTICO_VERSION).toMatch(/^ina-a5-pronostico-/)
    const claves = SERIES_PRONOSTICO_A5.map((x) => `${x.calId}:${x.seriesId}`)
    expect(new Set(claves).size).toBe(claves.length)
    expect(SERIES_PRONOSTICO_A5.filter((x) => x.calId === 499)).toHaveLength(28)
    expect(SERIES_PRONOSTICO_A5.filter((x) => x.calId === 289)).toHaveLength(8)
    expect(buscarSeriePronostico(499, 34863)).toMatchObject({ estacionId: 'pna-corrientes', variable: 'Hms', unidad: 'm', soporte: 'semanal_media' })
    expect(buscarSeriePronostico(289, 1540)).toMatchObject({ estacionId: 'pna-corrientes', variable: 'H', soporte: 'instantaneo' })
    expect(buscarSeriePronostico(499, 35471)).toMatchObject({ estacionId: null, a5EstacionId: 40, variable: 'Hmd', soporte: 'diario' })
    expect(buscarSeriePronostico(499, 34881)).toMatchObject({ estacionId: null, variable: null, unidad: null, soporte: 'desconocido' })
  })
})

describe('parsearCorridaA5 y normalizarCorrida', () => {
  it('conserva main/p10/p90 semanales sin convertir la media en pico diario', () => {
    const c = parsearCorridaA5(corrida499, 499)
    expect(c).toMatchObject({ calId: 499, corId: 1232623, forecastDate: '2026-10-16T12:00:00.000Z' })
    const n = normalizarCorrida(c)
    const corrientes = n.filas.filter((f) => f.seriesId === 34863)
    expect(corrientes.map((f) => f.qualifier)).toEqual(['main', 'p10', 'p90', 'main', 'p10', 'p90'])
    expect(corrientes[0]).toMatchObject({
      estacionId: 'pna-corrientes', variable: 'Hms', unidad: 'm', soporte: 'semanal_media',
      timestart: '2026-10-18T03:00:00.000Z', timeend: '2026-10-18T03:00:00.000Z',
    })
  })

  it('conserva inferior/medio/superior como etiquetas, con metadata null', () => {
    const n = normalizarCorrida(parsearCorridaA5(corrida289, 289))
    expect(new Set(n.filas.map((f) => f.qualifier))).toEqual(new Set(['inferior', 'medio', 'superior']))
    expect(n.filas.find((f) => f.seriesId === 3524)).toMatchObject({ estacionId: 'pna-goya', soporte: 'instantaneo' })
    expect(n.filas.every((f) => !('probabilidad' in f))).toBe(true)
  })

  it('acepta qualifier ausente, descarta repetidas y reporta series desconocidas sin perderlas', () => {
    const json = clonar(corrida289)
    const p = json.series[0].pronosticos
    delete (p[0] as { qualifier?: string }).qualifier
    p.push({ ...p[1] })
    json.series.push({ ...json.series[0], series_id: 999999, pronosticos: [p[1]] })
    const n = normalizarCorrida(parsearCorridaA5(json, 289))
    expect(n.filas[0].qualifier).toBeNull()
    expect(n.repetidas).toBe(1)
    expect(n.seriesDesconocidas).toEqual([999999])
    expect(n.filas.find((f) => f.seriesId === 999999)).toMatchObject({ estacionId: null, variable: null, unidad: null, soporte: 'desconocido' })
    expect(n.filas.filter((f) => f.seriesId === 1540)).toHaveLength(6)
  })

  it('rechaza calibrado equivocado, cor_id ajeno y payload sin forma', () => {
    expect(() => parsearCorridaA5(corrida499, 289)).toThrow(ErrorPayloadA5)
    const ajena = clonar(corrida289)
    ajena.series[0].cor_id = 1
    expect(() => parsearCorridaA5(ajena, 289)).toThrow(ErrorPayloadA5)
    expect(() => parsearCorridaA5({ id: 1 }, 289)).toThrow(ErrorPayloadA5)
  })
})

describe('crearClienteA5.obtenerUltimaCorrida', () => {
  it('pide la última corrida con pronósticos y devuelve payload crudo con sha256', async () => {
    const urls: string[] = []
    const cliente = crearClienteA5({
      fetchImpl: async (url) => {
        urls.push(String(url))
        return new Response(JSON.stringify(corrida289))
      },
    })
    const r = await cliente.obtenerUltimaCorrida(289)
    if (!r.ok) throw new Error(r.detalle)
    expect(urls[0]).toBe('https://alerta.ina.gob.ar/a5/sim/calibrados/289/corridas/last?includeProno=true&format=json')
    expect(r.datos.corrida.corId).toBe(1232811)
    expect(r.datos.sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('devuelve payload_invalido ante JSON inválido y timeout ante red colgada', async () => {
    const invalido = crearClienteA5({ fetchImpl: async () => new Response('<html>'), maxIntentos: 1 })
    expect(await invalido.obtenerUltimaCorrida(499)).toMatchObject({ ok: false, motivo: 'payload_invalido' })
    const colgado = crearClienteA5({ fetchImpl: () => new Promise<Response>(() => {}), timeoutMs: 5, maxIntentos: 1 })
    expect(await colgado.obtenerUltimaCorrida(499)).toMatchObject({ ok: false, motivo: 'timeout' })
  })
})
