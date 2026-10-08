import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ acceso: { ok: true, user: { id: 'test' } } as { ok: boolean; status?: number; user?: { id: string } }, enabled: true, run: null as unknown }))
vi.mock('@/lib/infraestructura/acceso-lectura', () => ({ verificarAccesoLectura: vi.fn(async () => mocks.acceso) }))
vi.mock('@/lib/infraestructura/riesgo/flags', () => ({ riskRadarEnabled: vi.fn(() => mocks.enabled) }))
vi.mock('@/lib/infraestructura/radar-meteo/job-sync', () => ({
  obtenerUltimoRunRadarMeteo: vi.fn(async () => mocks.run),
  obtenerRunRadarMeteoAsOf: vi.fn(async () => mocks.run),
}))

import { GET } from './route'
import { obtenerRunRadarMeteoAsOf, obtenerUltimoRunRadarMeteo } from '@/lib/infraestructura/radar-meteo/job-sync'

const times = Array.from({ length: 6 }, (_, i) => `2026-09-30T0${i}:00:00.000Z`)
const baseRun = {
  id: 'run-1', runAt: times[0], fetchedAt: times[0], model: 'best_match', gridVersion: 'corrientes-0.2-v1', units: {},
  payload: { times, cells: [{ id: 'r-1c-1', row: -1, col: -1, lat: -0.2, lon: -0.2 }, { id: 'r0c0', row: 0, col: 0, lat: 0, lon: 0 }], values: {
    precipitation_probability: [[60, 11, 12, 13, 14, 15], [60, 21, 22, 23, 24, 25]],
    precipitation: [[0.11, 0.22, 0.33, 0.44, 0.55, 0.66], [0.26, 0.3, 0.4, 0.5, 0.6, 0.7]],
    wind_speed_10m: [[1.4, 2, 3, 4, 5, 6], [10, 20, 30, 40, 50, 60]],
    weather_code: [[3, 3, 3, 96, 3, 3], [3, 3, 3, 99, 3, 3]],
    cape: [[1200, 1200, 1200, 0, 0, 0], [0, 0, 0, 0, 0, 0]],
    lifted_index: [[-1, -1, -1, null, null, null], [null, null, null, null, null, null]],
    wind_gusts_10m: [[20, 20, 20, 20, 20, 20], [20, 20, 20, 20, 20, 20]],
    freezing_level_height: [[3000, 3000, 3000, 3000, 3000, 3000], [3000, 3000, 3000, 3000, 3000, 3000]],
  } },
}
function req(query = '', headers?: HeadersInit) { return new Request(`http://localhost/api/infraestructura/radar-meteo${query}`, { headers }) }

describe('GET /api/infraestructura/radar-meteo', () => {
  beforeEach(() => {
    mocks.acceso = { ok: true, user: { id: 'test' } }; mocks.enabled = true; mocks.run = baseRun
    vi.mocked(obtenerUltimoRunRadarMeteo).mockClear()
    vi.mocked(obtenerRunRadarMeteoAsOf).mockClear()
  })

  it('usa la corrida vigente en asOf y no la más reciente', async () => {
    const asOf = '2026-09-30T05:00:00.000Z'
    const body = await (await GET(req(`?asOf=${encodeURIComponent(asOf)}`))).json()
    expect(obtenerRunRadarMeteoAsOf).toHaveBeenCalledWith(new Date(asOf))
    expect(obtenerUltimoRunRadarMeteo).not.toHaveBeenCalled()
    expect(body).toMatchObject({ runId: 'run-1', sinDatos: false })
  })

  it('no marca como desactualizada una corrida pasada con asOf', async () => {
    const body = await (await GET(req('?asOf=2026-09-30T05:00:00.000Z'))).json()
    expect(body.frescura).toBeNull()
  })

  it('rechaza asOf inválido con 400', async () => {
    const response = await GET(req('?asOf=ayer'))
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: 'Parámetro inválido: asOf' })
    expect(obtenerRunRadarMeteoAsOf).not.toHaveBeenCalled()
  })

  it('devuelve sinDatos con razón específica cuando no hay corrida hasta asOf', async () => {
    mocks.run = null
    const body = await (await GET(req('?asOf=2026-09-30T05:00:00.000Z'))).json()
    expect(body).toMatchObject({ sinDatos: true, runId: null, razon: 'No hay pronóstico publicado hasta ese momento.' })
  })

  it('sin asOf usa la corrida más reciente y mantiene frescura', async () => {
    const body = await (await GET(req())).json()
    expect(obtenerUltimoRunRadarMeteo).toHaveBeenCalled()
    expect(obtenerRunRadarMeteoAsOf).not.toHaveBeenCalled()
    expect(body.frescura).toEqual({ edadMinutos: expect.any(Number), desactualizado: expect.any(Boolean) })
  })

  it('aplica autenticación y flag', async () => {
    mocks.acceso = { ok: false, status: 401 }
    expect((await GET(req())).status).toBe(401)
    mocks.acceso = { ok: true, user: { id: 'test' } }; mocks.enabled = false
    expect((await GET(req())).status).toBe(404)
  })

  it('representa la ausencia de corrida sin ceros', async () => {
    mocks.run = null
    const response = await GET(req())
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body).toMatchObject({ sinDatos: true, runId: null, razon: expect.any(String), valores: {} })
    expect(response.headers.get('Cache-Control')).toBe('private, max-age=300')
  })

  it('filtra variables y redondea por unidad', async () => {
    const body = await (await GET(req('?variables=precipitation_probability,wind_speed_10m'))).json()
    expect(Object.keys(body.valores)).toEqual(['precipitation_probability', 'wind_speed_10m'])
    expect(body.valores.precipitation_probability[0]).toEqual([60, 60])
    expect(body.valores.wind_speed_10m[0]).toEqual([1, 10])
    expect(body.grid).toMatchObject({ lat0: 0, lon0: -0.2, filas: 2, columnas: 2 })
    expect(body.grid.celdas.map((c: { fila: number }) => c.fila)).toEqual([1, 0])
  })

  it('agrupa precipitation y alinea otras variables con la hora etiquetada', async () => {
    const variables = 'precipitation,wind_speed_10m'
    const body = await (await GET(req(`?variables=${variables}&paso=3&desde=${encodeURIComponent(times[0])}&hasta=${encodeURIComponent(times[5])}`))).json()
    expect(body.tiempos).toEqual([times[2], times[5]])
    expect(body.valores.precipitation[0]).toEqual([0.7, 1])
    expect(body.valores.precipitation[1]).toEqual([1.7, 1.8])
    expect(body.valores.wind_speed_10m).toEqual([[3, 30], [6, 60]])
  })

  it('devuelve ETag y responde 304 cuando coincide', async () => {
    const response = await GET(req())
    const etag = response.headers.get('ETag')
    expect(etag).toBeTruthy()
    const sinCambios = await GET(req('', { 'If-None-Match': etag! }))
    expect(sinCambios.status).toBe(304)
  })

  it('calcula granizo por hora con entradas sin redondear y solo devuelve lo pedido', async () => {
    const body = await (await GET(req('?variables=granizo'))).json()
    expect(Object.keys(body.valores)).toEqual(['granizo'])
    expect(body.unidades).toEqual({ granizo: 'categoria' })
    expect(body.valores.granizo).toEqual([[1, 0], [0, 0], [0, 0], [2, 3], [0, 0], [0, 0]])
  })

  it('toma la categoría máxima dentro de cada grupo de tres horas', async () => {
    const body = await (await GET(req('?variables=granizo&paso=3'))).json()
    expect(body.valores.granizo).toEqual([[1, 0], [2, 3]])
    expect(body.tiempos).toEqual([times[2], times[5]])
  })
})
