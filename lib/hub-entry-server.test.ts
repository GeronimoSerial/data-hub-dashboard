import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  redirect: vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`) }),
  getDb: vi.fn(),
  loadRecursoAccess: vi.fn(),
  loadRecursoAccessByRuta: vi.fn(),
  resourceRow: { id: 'infra-resource', formato: 'mapa', ruta: '/mapas/infraestructura' as string | null },
}))

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('@/lib/session', () => ({ getSessionUser: mocks.getSessionUser }))
vi.mock('@/lib/db', () => ({ getDb: mocks.getDb }))
vi.mock('@/lib/db/recurso-access', () => ({
  loadRecursoAccess: mocks.loadRecursoAccess,
  loadRecursoAccessByRuta: mocks.loadRecursoAccessByRuta,
}))

import { requireServerHubPageAccess, serverHubPathAllowedByExistingAcl } from './hub-entry-server'

describe('page-level hub authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getSessionUser.mockResolvedValue({
      id: 'staff-user', role: 'editor', banned: false,
      nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [],
      hubPolicy: { enabledSections: ['maps'], landing: false }, hubDestination: '/mapas',
    })
    mocks.resourceRow = { id: 'infra-resource', formato: 'mapa', ruta: '/mapas/infraestructura' }
    mocks.getDb.mockReturnValue({ select: () => ({ from: () => ({ where: () => ({ limit: async () => [mocks.resourceRow] }) }) }) })
    mocks.loadRecursoAccess.mockResolvedValue({ id: 'infra-resource', estado: 'publicado', audienciaNivelJurIds: [], audienciaUserIds: [] })
  })

  it('denies a disabled situation page at its page boundary even for staff', async () => {
    await expect(requireServerHubPageAccess('/situacion')).rejects.toThrow('REDIRECT:/forbidden')
  })

  it('routes a section-only landing navigation to its authorized destination', async () => {
    await expect(requireServerHubPageAccess('/')).rejects.toThrow('REDIRECT:/mapas')
    expect(mocks.redirect).toHaveBeenCalledWith('/mapas')
  })

  it('authorizes an enabled section page independently of the shared layout', async () => {
    await expect(requireServerHubPageAccess('/mapas')).resolves.toMatchObject({ role: 'editor' })
  })

  it('requires the dedicated booklet section at the server page boundary', async () => {
    await expect(requireServerHubPageAccess('/cuadernillos')).rejects.toThrow('REDIRECT:/forbidden')
    mocks.getSessionUser.mockResolvedValue({
      id: 'planning-user', role: 'consulta', banned: false,
      nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [],
      hubPolicy: { enabledSections: ['cuadernillos'], landing: false },
    })
    await expect(requireServerHubPageAccess('/cuadernillos')).resolves.toMatchObject({ role: 'consulta' })
  })

  it('lets a school operator with a CUE reach only the receipt page and denies the booklet workspace', async () => {
    mocks.getSessionUser.mockResolvedValue({
      id: 'school-op', role: 'operador_establecimiento', cueAnexo: '1-2', banned: false,
      nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [],
    })
    await expect(requireServerHubPageAccess('/cuadernillos/recepcion')).resolves.toMatchObject({ role: 'operador_establecimiento' })
    await expect(requireServerHubPageAccess('/cuadernillos')).rejects.toThrow('REDIRECT:/problematicas/parte/nuevo')
  })

  it('denies the receipt page to a school operator without a CUE', async () => {
    mocks.getSessionUser.mockResolvedValue({
      id: 'school-op', role: 'operador_establecimiento', banned: false,
      nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [],
    })
    await expect(requireServerHubPageAccess('/cuadernillos/recepcion')).rejects.toThrow(/REDIRECT:/)
  })

  it('keeps the receipt page behind the booklet section for non-confined users', async () => {
    await expect(requireServerHubPageAccess('/cuadernillos/recepcion')).rejects.toThrow('REDIRECT:/forbidden')
    mocks.getSessionUser.mockResolvedValue({
      id: 'admin', role: 'admin', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [],
    })
    await expect(requireServerHubPageAccess('/cuadernillos/recepcion')).resolves.toMatchObject({ role: 'admin' })
  })

  it('denies a direct resource detail URL when its canonical route belongs to a disabled section', async () => {
    await expect(requireServerHubPageAccess('/recursos/infra-resource')).rejects.toThrow('REDIRECT:/forbidden')
  })

  it('checks the canonical resource ACL for each legacy dashboard alias', async () => {
    const aliases = [
      ['/tablero', 'r2', 'tablero'],
      ['/mapa_interactivo', 'r3', 'mapa'],
      ['/mapa_sobreedad', 'r13', 'mapa'],
      ['/mapa_notas', 'r14', 'mapa'],
    ] as const
    const selectedUser = {
      id: 'consulta-selected', role: 'consulta' as const, banned: false,
      nivelJurIds: [], accesoRecursos: 'seleccionados' as const, recursoIds: [], hubPolicy: {},
    }
    for (const [alias, id, formato] of aliases) {
      mocks.resourceRow = { id, formato, ruta: null }
      mocks.loadRecursoAccess.mockResolvedValue({ id, estado: 'publicado', audienciaNivelJurIds: [], audienciaUserIds: [] })
      await expect(serverHubPathAllowedByExistingAcl(selectedUser, alias)).resolves.toBe(false)
      await expect(serverHubPathAllowedByExistingAcl({ ...selectedUser, recursoIds: [id] }, alias)).resolves.toBe(true)
      await expect(serverHubPathAllowedByExistingAcl({ ...selectedUser, banned: true, recursoIds: [id] }, alias)).resolves.toBe(false)
      expect(mocks.loadRecursoAccess).toHaveBeenLastCalledWith(id)
    }
  })
})

describe('resource audience gate for route-registered maps', () => {
  const audienceOf = (id: string, nivel: number[]) => ({ id, access: { id, estado: 'publicado' as const, audienciaNivelJurIds: nivel, audienciaUserIds: [] } })
  const consulta = (nivelJurIds: number[]) => ({
    id: 'consulta-user', role: 'consulta' as const, banned: false,
    nivelJurIds, accesoRecursos: 'todos' as const, recursoIds: [], hubPolicy: {},
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('denies reorganizacion to a user whose audience excludes the resource and admits an allowed user', async () => {
    mocks.loadRecursoAccessByRuta.mockResolvedValue(audienceOf('reorg-resource', [7]))
    await expect(serverHubPathAllowedByExistingAcl(consulta([1]), '/mapas/reorganizacion')).resolves.toBe(false)
    await expect(serverHubPathAllowedByExistingAcl(consulta([7]), '/mapas/reorganizacion')).resolves.toBe(true)
    expect(mocks.loadRecursoAccessByRuta).toHaveBeenLastCalledWith('/mapas/reorganizacion')
  })

  it('fails closed for reorganizacion when no resource is registered at its route', async () => {
    mocks.loadRecursoAccessByRuta.mockResolvedValue(null)
    await expect(serverHubPathAllowedByExistingAcl(consulta([7]), '/mapas/reorganizacion')).resolves.toBe(false)
  })

  it('keeps matricula and natalidad gated by their own resource audience', async () => {
    for (const route of ['/mapas/matricula', '/mapas/natalidad']) {
      mocks.loadRecursoAccessByRuta.mockResolvedValue(audienceOf(`${route}-resource`, [7]))
      await expect(serverHubPathAllowedByExistingAcl(consulta([1]), route)).resolves.toBe(false)
      await expect(serverHubPathAllowedByExistingAcl(consulta([7]), route)).resolves.toBe(true)
      expect(mocks.loadRecursoAccessByRuta).toHaveBeenLastCalledWith(route)
    }
  })

  it('leaves infrastructure and unlisted map routes on their previous behavior', async () => {
    mocks.loadRecursoAccessByRuta.mockResolvedValue(audienceOf('infra-resource', [7]))
    await expect(serverHubPathAllowedByExistingAcl(consulta([1]), '/mapas/infraestructura')).resolves.toBe(false)
    expect(mocks.loadRecursoAccessByRuta).toHaveBeenLastCalledWith('/mapas/infraestructura')
    mocks.loadRecursoAccessByRuta.mockClear()
    await expect(serverHubPathAllowedByExistingAcl(consulta([1]), '/mapas')).resolves.toBe(true)
    expect(mocks.loadRecursoAccessByRuta).not.toHaveBeenCalled()
  })
})
