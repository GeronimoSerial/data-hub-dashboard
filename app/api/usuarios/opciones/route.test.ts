import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  actor: { id: 'admin-1', role: 'admin', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [] } as Record<string, unknown>,
  ensureSeeded: vi.fn(),
  getSessionUser: vi.fn(),
  loadHubCatalog: vi.fn(),
  mutateUsuariosDenied: vi.fn(),
  getHubUserSession: vi.fn(),
  allowed: vi.fn(),
}))

vi.mock('@/lib/session', () => ({ getSessionUser: mocks.getSessionUser }))
vi.mock('@/lib/db/seed', () => ({ ensureSeeded: mocks.ensureSeeded }))
vi.mock('@/lib/db/hub', () => ({ loadHubCatalog: mocks.loadHubCatalog }))
vi.mock('@/lib/usuarios', () => ({ mutateUsuariosDenied: mocks.mutateUsuariosDenied, getHubUserSession: mocks.getHubUserSession }))
vi.mock('@/lib/hub-entry-server', () => ({ serverHubPathAllowedByExistingAcl: mocks.allowed }))

import { beforeAll } from 'vitest'
import { migrarDb } from '@/lib/db'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'

// Fixture: cada intento deja un evento en auditoria_evento, así que la ruta necesita una base migrada.
usarDbTemporal('usuarios-opciones-fixture-', { seed: false })
beforeAll(async () => { await migrarDb() })

import { GET, POST } from './route'

describe('/api/usuarios/opciones', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getSessionUser.mockResolvedValue(mocks.actor)
    mocks.mutateUsuariosDenied.mockReturnValue(null)
    mocks.loadHubCatalog.mockResolvedValue({ recursos: [{ id: 'hidden-by-t4', titulo: 'Recurso', nivelId: 'n1' }], niveles: [{ id: 'n1', nombre: 'Nivel' }] })
    mocks.allowed.mockResolvedValue(true)
    mocks.getHubUserSession.mockResolvedValue({ id: 'target', role: 'consulta', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [], cueAnexo: null })
  })

  it('rejects non-admin access before returning management-only resources', async () => {
    mocks.mutateUsuariosDenied.mockReturnValue({ status: 403, error: 'No autorizado' })
    const response = await GET(new Request('http://localhost/api'))
    expect(response.status).toBe(403)
    expect(mocks.loadHubCatalog).not.toHaveBeenCalled()
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('returns 401 anonymously and 403 to editor and regular roles for both option methods', async () => {
    for (const status of [401, 403]) {
      mocks.mutateUsuariosDenied.mockReturnValue({ status, error: 'denied' })
      expect((await GET(new Request('http://localhost/api'))).status).toBe(status)
      const response = await POST(new Request('http://localhost/api/usuarios/opciones', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'consulta', nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [] }),
      }))
      expect(response.status).toBe(status)
    }
  })

  it('returns minimal management choices outside the section-filtered read catalog', async () => {
    const response = await GET(new Request('http://localhost/api'))
    expect(await response.json()).toEqual({ recursos: [{ id: 'hidden-by-t4', titulo: 'Recurso', nivelId: 'n1', nivelNombre: 'Nivel' }] })
    expect(mocks.loadHubCatalog).toHaveBeenCalledWith({ publishedOnly: false })
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('evaluates destination options against the edited target scope, not the administrator', async () => {
    const response = await POST(new Request('http://localhost/api/usuarios/opciones', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'target', role: 'director_nivel', nivelJurIds: [7], accesoRecursos: 'seleccionados', recursoIds: ['r7'] }),
    }))
    expect(response.status).toBe(200)
    expect(mocks.getHubUserSession).toHaveBeenCalledWith('target')
    expect(mocks.allowed.mock.calls[0][0]).toMatchObject({ id: 'target', role: 'director_nivel', nivelJurIds: [7], accesoRecursos: 'seleccionados', recursoIds: ['r7'] })
    expect((await response.json()).destinos).toContain('/mapas/infraestructura')
  })

  it('retains a target GE CUE and existing jurisdiction/resource controls during destination evaluation', async () => {
    mocks.getHubUserSession.mockResolvedValue({
      id: 'target', role: 'operador_establecimiento', banned: false, cueAnexo: '1234567801', nivelJurIds: [2],
      accesoRecursos: 'seleccionados', recursoIds: ['r-old'] })
    mocks.allowed.mockImplementation(async (candidate: Record<string, unknown>) => candidate.cueAnexo === '1234567801'
      && (candidate.recursoIds as string[]).includes('r7'))
    const response = await POST(new Request('http://localhost/api/usuarios/opciones', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'target', role: 'operador_establecimiento', nivelJurIds: [7], accesoRecursos: 'seleccionados', recursoIds: ['r7'] }),
    }))
    expect(response.status).toBe(200)
    expect((await response.json()).destinos).toContain('/problematicas/parte/nuevo')
    expect(mocks.allowed.mock.calls[0][0]).toMatchObject({ cueAnexo: '1234567801', nivelJurIds: [7], accesoRecursos: 'seleccionados', recursoIds: ['r7'] })
  })

  it('returns configurable destinations for a temporarily banned target without clearing the ban', async () => {
    const bannedTarget = { id: 'target', role: 'consulta', banned: true, cueAnexo: null,
      nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [] }
    mocks.getHubUserSession.mockResolvedValue(bannedTarget)
    const response = await POST(new Request('http://localhost/api/usuarios/opciones', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'target', role: 'consulta', nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [] }),
    }))
    expect(response.status).toBe(200)
    expect(mocks.allowed.mock.calls[0][0]).toMatchObject({ banned: false })
    expect(bannedTarget.banned).toBe(true)
    expect((await response.json()).destinos).toContain('/explorar')
  })
})
