import { describe, expect, it } from 'vitest'
import { pathAllowedByHubPolicy, resolveHubEntry, safeInternalReturnTo } from './hub-entry'
import type { SessionUser } from './acl'

function user(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: 'user-1',
    role: 'consulta',
    banned: false,
    nivelJurIds: [],
    accesoRecursos: 'todos',
    recursoIds: [],
    hubPolicy: { enabledSections: ['maps'], landing: false },
    hubDestination: '/mapas',
    ...overrides,
  }
}

describe('hub entry routing', () => {
  it('preserves the complete query string on an authorized map deep link', async () => {
    await expect(resolveHubEntry({
      user: user({ hubPolicy: { enabledSections: ['infrastructure'], landing: false }, hubDestination: '/mapas/infraestructura' }),
      callbackUrl: '/mapas/infraestructura?cue=1800554-00&tab=actual',
      allowedByExistingAcl: () => true,
    })).resolves.toBe('/mapas/infraestructura?cue=1800554-00&tab=actual')
  })

  it('preserves a resource-viewer callback when trusted membership/ACL resolvers allow it', async () => {
    await expect(resolveHubEntry({
      user: user(),
      callbackUrl: '/recursos/map-resource?panel=datos&year=2026',
      allowedByHubPolicy: () => true,
      allowedByExistingAcl: () => true,
    })).resolves.toBe('/recursos/map-resource?panel=datos&year=2026')
  })

  it('rejects denied callbacks and uses a configured authorized destination', async () => {
    await expect(resolveHubEntry({
      user: user(),
      callbackUrl: '/reportes?formato=reporte',
      allowedByExistingAcl: () => true,
    })).resolves.toBe('/mapas')
  })

  it.each([
    { section: 'maps' as const, destination: '/mapas', denied: '/explorar?formato=mapa' },
    { section: 'dashboards' as const, destination: '/tableros', denied: '/explorar?formato=tablero' },
    { section: 'infrastructure' as const, destination: '/mapas/infraestructura', denied: '/mapas' },
  ])('resolves a $section-only account without redirect loops', async ({ section, destination, denied }) => {
    const configured = user({ hubPolicy: { enabledSections: [section], landing: false }, hubDestination: destination })
    const resolved = await resolveHubEntry({
      user: configured,
      callbackUrl: denied,
      currentPath: '/',
      allowedByExistingAcl: () => true,
    })
    expect(resolved).toBe(destination)
    expect(resolved).not.toBe(denied)
    expect(resolved).not.toBe('/')
  })

  it('never restores landing access for a section-only account', async () => {
    const restricted = user({ hubPolicy: { enabledSections: ['maps'], landing: false }, hubDestination: '/' })
    expect(pathAllowedByHubPolicy('/', restricted)).toBe(false)
    await expect(resolveHubEntry({ user: restricted, allowedByExistingAcl: () => true })).resolves.toBe('/mapas')
  })

  it('returns no destination for an explicit-empty or banned account when no valid target exists', async () => {
    const empty = user({ hubPolicy: { enabledSections: [], landing: false }, hubDestination: null })
    await expect(resolveHubEntry({ user: empty, allowedByExistingAcl: () => true })).resolves.toBeNull()
    await expect(resolveHubEntry({ user: user({ banned: true }), allowedByExistingAcl: () => true })).resolves.toBeNull()
  })

  it('does not redirect to the current path when a configured destination becomes unusable', async () => {
    await expect(resolveHubEntry({
      user: user({ hubDestination: '/mapas' }),
      currentPath: '/mapas',
      allowedByExistingAcl: () => true,
    })).resolves.toBe('/mapas/matricula')
  })

  it('keeps the GE operator destination ahead of ordinary defaults', async () => {
    await expect(resolveHubEntry({
      user: user({ role: 'operador_establecimiento', cueAnexo: '1800554-00', hubDestination: '/mapas' }),
      allowedByExistingAcl: () => true,
    })).resolves.toBe('/problematicas/parte/nuevo')
  })

  it.each([
    'https://evil.example/path',
    '//evil.example/path',
    '/%2f%2fevil.example',
    '/mapas\\..\\admin',
    '/mapas/%252f..%252fadmin',
    '/mapas/%0d%0aLocation:evil',
    '/mapas/%zz',
  ])('rejects unsafe callback form %s', (candidate) => {
    expect(safeInternalReturnTo(candidate)).toBeNull()
  })

  it('accepts a valid internal path and query without rewriting its parameters', () => {
    expect(safeInternalReturnTo('/mapas/infraestructura?cue=a%20b&tab=actual')).toEqual({
      pathname: '/mapas/infraestructura',
      search: '?cue=a%20b&tab=actual',
      href: '/mapas/infraestructura?cue=a%20b&tab=actual',
    })
  })
})
