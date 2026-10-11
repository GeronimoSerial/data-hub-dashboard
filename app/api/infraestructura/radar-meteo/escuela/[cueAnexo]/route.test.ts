import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  acceso: { ok: true, user: { id: 'test' } } as { ok: boolean; status?: number; user?: { id: string } },
  enabled: true,
  run: null as unknown,
  escuelas: [] as Array<{
    cueAnexo: string
    nombre: string
    lat: number | null
    lon: number | null
    departamento: string
  }>,
}))

vi.mock('@/lib/infraestructura/acceso-lectura', () => ({
  verificarAccesoLectura: vi.fn(async () => mocks.acceso),
}))
vi.mock('@/lib/infraestructura/riesgo/flags', () => ({
  riskRadarEnabled: vi.fn(() => mocks.enabled),
}))
vi.mock('@/lib/infraestructura/radar-meteo/job-sync', () => ({
  obtenerUltimoRunRadarMeteo: vi.fn(async () => mocks.run),
  obtenerRunRadarMeteoAsOf: vi.fn(async () => mocks.run),
}))
vi.mock('@/lib/infraestructura/radar-meteo/ensemble', () => ({
  alertasAndEnsemble: vi.fn(async () => null),
}))
vi.mock('@/lib/infraestructura/parte-mapa', () => ({
  listarEscuelasMapa: vi.fn(async () => ({ escuelas: mocks.escuelas })),
}))

import { GET } from './route'
import { obtenerRunRadarMeteoAsOf, obtenerUltimoRunRadarMeteo } from '@/lib/infraestructura/radar-meteo/job-sync'

const req = (ifNoneMatch?: string) => new Request('http://localhost', {
  headers: ifNoneMatch ? { 'If-None-Match': ifNoneMatch } : {},
})
const reqAsOf = (asOf: string) => new Request(`http://localhost?asOf=${encodeURIComponent(asOf)}`)
const ctx = (cueAnexo: string) => ({ params: Promise.resolve({ cueAnexo }) })

describe('GET /api/infraestructura/radar-meteo/escuela/[cueAnexo]', () => {
  beforeEach(() => {
    mocks.acceso = { ok: true, user: { id: 'test' } }
    mocks.enabled = true
    mocks.run = null
    mocks.escuelas = [{
      cueAnexo: '1801605-04', nombre: 'Escuela', lat: -27.5, lon: -58.8,
      departamento: 'Capital',
    }]
  })

  it('valida acceso, flag y CUE', async () => {
    mocks.acceso = { ok: false, status: 401 }
    expect((await GET(req(), ctx('1801605-04'))).status).toBe(401)
    mocks.acceso = { ok: true, user: { id: 'test' } }
    mocks.enabled = false
    expect((await GET(req(), ctx('1801605-04'))).status).toBe(404)
    mocks.enabled = true
    expect((await GET(req(), ctx('bad'))).status).toBe(400)
  })

  it('distingue escuela inexistente y forecast vacío', async () => {
    mocks.escuelas = []
    expect((await GET(req(), ctx('1801605-04'))).status).toBe(404)
    mocks.escuelas = [{
      cueAnexo: '1801605-04', nombre: 'Escuela', lat: -27.5, lon: -58.8,
      departamento: 'Capital',
    }]
    expect(await (await GET(req(), ctx('1801605-04'))).json())
      .toMatchObject({ sinDatos: true, runId: null })
  })

  it('incluye ETag por corrida y CUE', async () => {
    mocks.run = {
      id: 'run-school', runAt: new Date().toISOString(), gridVersion: 'corrientes-0.2-v1',
      payload: {
        times: [new Date(Date.now() + 3600000).toISOString()],
        cells: [{ id: 'r-138c-294', row: -138, col: -294, lat: -27.6, lon: -58.8 }],
        values: { precipitation: [[2]], wind_gusts_10m: [[30]], weather_code: [[3]] },
      },
    }
    const response = await GET(req(), ctx('1801605-04'))
    expect(response.status).toBe(200)
    expect(response.headers.get('ETag')).toBeTruthy()
    expect((await GET(req(response.headers.get('ETag')!), ctx('1801605-04'))).status).toBe(304)
  })

  it('valida asOf después del CUE y responde 400 si es inválido', async () => {
    expect((await GET(reqAsOf('ayer'), ctx('bad'))).status).toBe(400)
    const response = await GET(reqAsOf('ayer'), ctx('1801605-04'))
    expect(response.status).toBe(400)
    expect(await response.text()).toContain('Parámetro inválido: asOf')
  })

  it('usa el run publicado hasta asOf, omite frescura y no usa el último run', async () => {
    mocks.run = {
      id: 'run-school-asof', runAt: '2026-09-30T12:00:00Z', gridVersion: 'corrientes-0.2-v1',
      payload: {
        times: ['2026-09-30T12:00:00Z'],
        cells: [{ id: 'r-138c-294', row: -138, col: -294, lat: -27.6, lon: -58.8 }],
        values: { precipitation: [[2]], wind_gusts_10m: [[30]], weather_code: [[3]] },
      },
    }
    vi.mocked(obtenerRunRadarMeteoAsOf).mockClear()
    vi.mocked(obtenerUltimoRunRadarMeteo).mockClear()
    const asOf = '2026-09-30T11:00:00-03:00'
    const response = await GET(reqAsOf(asOf), ctx('1801605-04'))
    expect(response.status).toBe(200)
    expect(obtenerRunRadarMeteoAsOf).toHaveBeenCalledWith(new Date(asOf))
    expect(obtenerUltimoRunRadarMeteo).not.toHaveBeenCalled()
    expect(await response.json()).toMatchObject({ runId: 'run-school-asof', frescura: null, sinDatos: false })
    expect(response.headers.get('ETag')).toBeTruthy()
  })

  it('asOf sin run responde sinDatos con razón explícita', async () => {
    mocks.run = null
    const body = await (await GET(reqAsOf('2020-01-01T00:00:00-03:00'), ctx('1801605-04'))).json()
    expect(body).toMatchObject({ sinDatos: true, runId: null, razon: 'No hay pronóstico publicado hasta ese momento.' })
  })
})
