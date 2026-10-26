import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/acl'

// Role x route matrix. It runs the real hub decision functions (page gate,
// hub layout gate and post-login entry) and pins who reaches what. Any change
// in reach shows up as a diff in the expectations below.

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  redirect: vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`) }),
  getDb: vi.fn(),
  loadRecursoAccess: vi.fn(),
  loadRecursoAccessByRuta: vi.fn(),
}))

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('@/lib/session', () => ({ getSessionUser: mocks.getSessionUser }))
vi.mock('@/lib/db', () => ({ getDb: mocks.getDb }))
vi.mock('@/lib/db/recurso-access', () => ({
  loadRecursoAccess: mocks.loadRecursoAccess,
  loadRecursoAccessByRuta: mocks.loadRecursoAccessByRuta,
}))

import { adminPageGate } from '@/lib/acl'
import { hubConfined } from './hub-confinement'
import { hubApiAccessResponse, resolveServerHubEntry, requireServerHubPageAccess, serverHubPathAllowedByPolicy } from '@/lib/hub-entry-server'

const base = { banned: false, nivelJurIds: [], accesoRecursos: 'todos' as const, recursoIds: [] }

const users: Record<string, SessionUser> = {
  admin: { ...base, id: 'u-admin', role: 'admin' },
  editor: { ...base, id: 'u-editor', role: 'editor' },
  'consulta legacy': { ...base, id: 'u-consulta', role: 'consulta' },
  'consulta restringida': {
    ...base,
    id: 'u-consulta-r',
    role: 'consulta',
    hubPolicy: { enabledSections: ['maps'], landing: false },
    hubDestination: '/mapas',
  },
  'director con niveles': { ...base, id: 'u-dir', role: 'director_nivel', nivelJurIds: [3] },
  'director sin niveles': { ...base, id: 'u-dir0', role: 'director_nivel' },
  'operador con cue': { ...base, id: 'u-op', role: 'operador_establecimiento', cueAnexo: '1-2' },
}

const paths = [
  '/',
  '/explorar',
  '/recursos/r1',
  '/tableros',
  '/situacion',
  '/admin',
  '/mapas/infraestructura',
  '/mapas/infraestructura/escuelas/123',
  '/infraestructura/cargar',
  '/problematicas/parte/nuevo',
] as const

const ALLOWED = 'allowed'
const forbidden = 'redirect:/forbidden'
const toParte = 'redirect:/problematicas/parte/nuevo'
const toInfra = 'redirect:/mapas/infraestructura'

// Expected outcome per user, in the order of `paths`.
const expected: Record<string, readonly string[]> = {
  'admin': [ALLOWED, ALLOWED, ALLOWED, ALLOWED, ALLOWED, ALLOWED, ALLOWED, ALLOWED, ALLOWED, forbidden],
  'editor': [ALLOWED, ALLOWED, ALLOWED, ALLOWED, ALLOWED, ALLOWED, ALLOWED, ALLOWED, ALLOWED, forbidden],
  'consulta legacy': [ALLOWED, ALLOWED, ALLOWED, ALLOWED, forbidden, forbidden, ALLOWED, ALLOWED, ALLOWED, forbidden],
  'consulta restringida': [
    'redirect:/mapas', forbidden, forbidden, forbidden, forbidden, forbidden, forbidden, forbidden, forbidden, forbidden,
  ],
  'director con niveles': [toInfra, toInfra, toInfra, toInfra, toInfra, toInfra, ALLOWED, ALLOWED, ALLOWED, toInfra],
  'director sin niveles': [forbidden, forbidden, forbidden, forbidden, forbidden, forbidden, forbidden, forbidden, ALLOWED, forbidden],
  'operador con cue': [toParte, toParte, toParte, toParte, toParte, toParte, toParte, toParte, toParte, ALLOWED],
}

// Post-login destination: resolveServerHubEntry with the login callbackUrl.
const postLogin: Array<[string, string | undefined, string]> = [
  ['director con niveles', undefined, '/mapas/infraestructura'],
  ['director con niveles', '/', '/mapas/infraestructura'],
  ['director con niveles', '/mapas/infraestructura/escuelas/123', '/mapas/infraestructura/escuelas/123'],
  ['director sin niveles', undefined, '/forbidden'],
  ['director sin niveles', '/mapas/infraestructura', '/forbidden'],
  ['operador con cue', undefined, '/problematicas/parte/nuevo'],
  ['operador con cue', '/', '/problematicas/parte/nuevo'],
  ['admin', '/mapas/infraestructura/escuelas/123', '/mapas/infraestructura/escuelas/123'],
  ['admin', undefined, '/'],
]

async function outcomeOf(user: SessionUser, path: string): Promise<string> {
  // Confined roles (no hub.recursos) are bounced by the hub layout before any page gate runs.
  if (hubConfined(user) && !(await serverHubPathAllowedByPolicy(user, path))) {
    return `redirect:${(await resolveServerHubEntry(user, { currentPath: path })) ?? '/forbidden'}`
  }
  // Admin pages are gated by the admin layout (adminPageGate), not by the hub page gate.
  if (path === '/admin') return adminPageGate(user) === 'ok' ? ALLOWED : forbidden
  mocks.getSessionUser.mockResolvedValue(user)
  try {
    await requireServerHubPageAccess(path)
    return ALLOWED
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return message.replace(/^REDIRECT:/, 'redirect:')
  }
}

describe('role x route matrix', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getDb.mockReturnValue({
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ id: 'r1', formato: 'reporte', ruta: null }] }) }) }),
    })
    mocks.loadRecursoAccess.mockResolvedValue({ id: 'r1', estado: 'publicado', audienciaNivelJurIds: [], audienciaUserIds: ['u-consulta'] })
    mocks.loadRecursoAccessByRuta.mockResolvedValue({
      id: 'infra',
      access: { id: 'infra', estado: 'publicado', audienciaNivelJurIds: [], audienciaUserIds: [] },
    })
  })

  for (const [label, expectedRow] of Object.entries(expected)) {
    it(`reach for ${label}`, async () => {
      const row: string[] = []
      for (const path of paths) row.push(await outcomeOf(users[label], path))
      expect(Object.fromEntries(paths.map((path, i) => [path, row[i]]))).toEqual(
        Object.fromEntries(paths.map((path, i) => [path, expectedRow[i]])),
      )
    })
  }

  it.each(postLogin)('post-login for %s with callback %s lands on %s', async (label, callbackUrl, destination) => {
    // The login page sends a null entry to /forbidden.
    await expect(resolveServerHubEntry(users[label], { callbackUrl })).resolves.toBe(destination === '/forbidden' ? null : destination)
  })
})

describe('hub API decision for confined roles', () => {
  it.each(['director con niveles', 'director sin niveles', 'operador con cue'])('answers 403 on /api/hub for %s', async (label) => {
    const response = await hubApiAccessResponse(users[label], '/explorar')
    expect(response?.status).toBe(403)
  })

  it('keeps /api/hub open for a consulta user', async () => {
    mocks.getDb.mockReturnValue({
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
    })
    await expect(hubApiAccessResponse(users['consulta legacy'], '/explorar')).resolves.toBeNull()
  })
})
