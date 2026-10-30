import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  user: vi.fn(),
  loadAccess: vi.fn(),
  puedeAbrir: vi.fn(),
  ensureSeeded: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
  },
}))
vi.mock('@/lib/session', () => ({ getSessionUser: mocks.user }))
vi.mock('@/lib/acl', () => ({ puedeAbrir: mocks.puedeAbrir }))
vi.mock('@/lib/db/recurso-access', () => ({ loadRecursoAccessByRuta: mocks.loadAccess }))
vi.mock('@/lib/db/seed', () => ({ ensureSeeded: mocks.ensureSeeded }))
vi.mock('@/lib/hub-entry-server', () => ({ requireServerHubPageAccess: mocks.guard }))
vi.mock('./map-client', () => ({ ReorganizacionMapClient: () => null }))

import { ReorganizacionMapClient } from './map-client'
import ReorganizacionMapRoute from './page'

const acceso = { access: { audiencias: [] } }

describe('página del mapa de reorganización', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.guard.mockResolvedValue(undefined)
    mocks.ensureSeeded.mockResolvedValue(undefined)
    mocks.loadAccess.mockResolvedValue(acceso)
  })

  it('exige acceso de página a la ruta canónica', async () => {
    mocks.user.mockResolvedValue(null)
    await expect(ReorganizacionMapRoute()).rejects.toThrow('REDIRECT:/login?callbackUrl=/mapas/reorganizacion')
    expect(mocks.guard).toHaveBeenCalledWith('/mapas/reorganizacion')
  })

  it('redirige a /forbidden cuando el usuario no tiene audiencia', async () => {
    mocks.user.mockResolvedValue({ id: 'u1' })
    mocks.puedeAbrir.mockReturnValue(false)
    await expect(ReorganizacionMapRoute()).rejects.toThrow('REDIRECT:/forbidden')
    expect(mocks.loadAccess).toHaveBeenCalledWith('/mapas/reorganizacion')
  })

  it('renderiza el cliente del mapa cuando el usuario puede abrirlo', async () => {
    mocks.user.mockResolvedValue({ id: 'u1' })
    mocks.puedeAbrir.mockReturnValue(true)
    const result = await ReorganizacionMapRoute()
    expect(result.type).toBe(ReorganizacionMapClient)
  })
})
