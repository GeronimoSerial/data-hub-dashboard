import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ acceso: { ok: true, user: { id: 'test' } } as { ok: boolean; status?: number; user?: { id: string } }, enabled: true, corridas: [] as unknown[] }))
vi.mock('@/lib/infraestructura/acceso-lectura', () => ({ verificarAccesoLectura: vi.fn(async () => mocks.acceso) }))
vi.mock('@/lib/infraestructura/riesgo/flags', () => ({ riskRadarEnabled: vi.fn(() => mocks.enabled) }))
vi.mock('@/lib/infraestructura/radar-meteo/job-sync', () => ({
  listarRunsRadarMeteoRecientes: vi.fn(async () => mocks.corridas),
}))

import { GET } from './route'
import { listarRunsRadarMeteoRecientes } from '@/lib/infraestructura/radar-meteo/job-sync'

const corridas = [
  { id: 'run-2', runAt: '2026-10-08T06:00:00.000Z', fetchedAt: '2026-10-08T06:05:00.000Z' },
  { id: 'run-1', runAt: '2026-10-08T03:00:00.000Z', fetchedAt: '2026-10-08T03:04:00.000Z' },
]

describe('GET /api/infraestructura/radar-meteo/corridas', () => {
  beforeEach(() => {
    mocks.acceso = { ok: true, user: { id: 'test' } }
    mocks.enabled = true
    mocks.corridas = corridas
    vi.mocked(listarRunsRadarMeteoRecientes).mockClear()
  })

  it('devuelve el acceso denegado sin consultar corridas', async () => {
    mocks.acceso = { ok: false, status: 401 }
    const response = await GET()
    expect(response.status).toBe(401)
    expect(listarRunsRadarMeteoRecientes).not.toHaveBeenCalled()
  })

  it('responde 404 cuando el radar no está habilitado', async () => {
    mocks.enabled = false
    const response = await GET()
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Radar no habilitado' })
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(listarRunsRadarMeteoRecientes).not.toHaveBeenCalled()
  })

  it('devuelve las corridas en el orden recibido del helper (más nuevas primero)', async () => {
    const response = await GET()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ corridas })
    expect(response.headers.get('Cache-Control')).toBe('private, max-age=60')
    expect(listarRunsRadarMeteoRecientes).toHaveBeenCalledTimes(1)
  })

  it('devuelve una lista vacía con 200 cuando no hay corridas recientes', async () => {
    mocks.corridas = []
    const response = await GET()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ corridas: [] })
  })
})
