import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ acceso: { ok: true, user: { id: 'test' } } as { ok: boolean; status?: number; user?: { id: string } }, enabled: true, run: null as unknown }))
vi.mock('@/lib/infraestructura/acceso-lectura', () => ({ verificarAccesoLectura: vi.fn(async () => mocks.acceso) }))
vi.mock('@/lib/infraestructura/riesgo/flags', () => ({ riskRadarEnabled: vi.fn(() => mocks.enabled) }))
vi.mock('@/lib/infraestructura/radar-meteo/job-sync', () => ({ obtenerUltimoRunRadarMeteo: vi.fn(async () => mocks.run) }))
import { GET } from './route'
const req = (headers?: HeadersInit) => new Request('http://localhost/api/infraestructura/radar-meteo/resumen', { headers })
describe('GET /api/infraestructura/radar-meteo/resumen', () => {
  beforeEach(() => { mocks.acceso = { ok: true, user: { id: 'test' } }; mocks.enabled = true; mocks.run = null })
  it('requiere acceso y respeta el flag', async () => {
    mocks.acceso = { ok: false, status: 401 }
    expect((await GET(req())).status).toBe(401)
    mocks.acceso = { ok: true, user: { id: 'test' } }; mocks.enabled = false
    expect((await GET(req())).status).toBe(404)
  })
  it('devuelve sinDatos explícito y conserva ETag/cache', async () => {
    const response = await GET(req())
    expect(await response.json()).toMatchObject({ sinDatos: true, runId: null, dias: [], departamentos: [], alertasSmn: [] })
    expect(response.headers.get('Cache-Control')).toBe('private, max-age=300')
    expect((await GET(req({ 'If-None-Match': response.headers.get('ETag')! }))).status).toBe(304)
  })
})
