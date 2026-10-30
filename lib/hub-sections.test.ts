import { describe, expect, it } from 'vitest'
import { puedeVerEnSeccion, type SessionUser } from './acl'
import { effectiveSections, HUB_DESTINATIONS, normalizeSectionPolicy, resourceInSections, safeDestination, sectionForPath, type SectionPolicy } from './hub-sections'

const user: SessionUser = { id: 'u', role: 'consulta', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [] }
const resource = { id: 'r', estado: 'publicado' as const, audienciaNivelJurIds: [], audienciaUserIds: [], formato: 'mapa' as const }
const sectionOnly: SectionPolicy = { enabledSections: ['infrastructure'], landing: false }

describe('hub section registry', () => {
  it('keeps section access distinct from landing access and distinguishes unset from empty', () => {
    expect(effectiveSections({}).size).toBeGreaterThan(0)
    expect(effectiveSections({ enabledSections: [] }).size).toBe(0)
    expect(sectionForPath('/')).toBe('landing')
    expect(safeDestination({ policy: sectionOnly, destination: '/', allowedByExistingAcl: () => true })).toBeNull()
    expect(safeDestination({ policy: sectionOnly, destination: '/mapas/infraestructura', allowedByExistingAcl: () => true })).not.toBeNull()
    expect(normalizeSectionPolicy({ enabledSections: null, landing: null })).toEqual({})
    expect(normalizeSectionPolicy({ enabledSections: [], landing: false })).toEqual({ enabledSections: [], landing: false })
  })

  it('classifies aliases and query-filter aliases by route membership, not query', () => {
    expect(sectionForPath('/reportes?formato=mapa')).toBe('reports')
    expect(sectionForPath('/tablero')).toBe('dashboards')
    expect(sectionForPath('/mapa_sobreedad')).toBe('maps')
    expect(sectionForPath('/mapas/infraestructura/escuelas/123')).toBe('infrastructure')
    expect(sectionForPath('/login')).toBeNull()
  })

  it('uses specific route membership over broad format, and existing ACL still wins', () => {
    expect(resourceInSections({ formato: 'mapa', ruta: '/mapas/infraestructura' }, new Set(['infrastructure']))).toBe(true)
    expect(puedeVerEnSeccion(user, { ...resource, ruta: '/mapas/infraestructura' }, sectionOnly)).toBe(true)
    expect(puedeVerEnSeccion({ ...user, role: 'consulta', accesoRecursos: 'seleccionados' }, { ...resource, ruta: '/mapas/infraestructura' }, sectionOnly)).toBe(false)
    expect(puedeVerEnSeccion({ ...user, banned: true }, resource, {})).toBe(false)
  })

  it('rejects untrusted, encoded and backslash destinations without invoking ACL callback', () => {
    for (const destination of ['https://evil.test/', '//evil.test', '/%2f%2fevil.test', '/%5c%5cevil.test', '/\\evil.test', '/mapas/../login', '/unknown']) {
      let called = false
      expect(safeDestination({ policy: {}, destination, allowedByExistingAcl: () => { called = true; return true } })).toBeNull()
      expect(called).toBe(false)
    }
  })

  it('rejects disabled sections and destinations denied by current ACL; never defaults to landing', () => {
    expect(safeDestination({ policy: { enabledSections: [], landing: false }, destination: '/mapas', allowedByExistingAcl: () => true })).toBeNull()
    expect(safeDestination({ policy: { enabledSections: ['maps'], landing: false }, destination: '/mapas', allowedByExistingAcl: () => false })).toBeNull()
    expect(safeDestination({ policy: { enabledSections: [], landing: false }, destination: '/', allowedByExistingAcl: () => true })).toBeNull()
  })

  it('requires existing authorization for configured and fallback landing destinations', () => {
    const landingPolicy = { enabledSections: [], landing: true }
    expect(safeDestination({ policy: landingPolicy, destination: '/', allowedByExistingAcl: () => true })?.path).toBe('/')
    expect(safeDestination({ policy: landingPolicy, destination: '/', allowedByExistingAcl: () => false })).toBeNull()

    const bannedUser = { ...user, banned: true }
    const landingAcl = (path: string) => path === '/' && !bannedUser.banned
    expect(safeDestination({ policy: landingPolicy, destination: '/', allowedByExistingAcl: landingAcl })).toBeNull()
  })

  it('registers reorganizacion as a maps destination with the same section gate as natalidad', () => {
    expect(HUB_DESTINATIONS).toContainEqual({ kind: 'section', section: 'maps', path: '/mapas/reorganizacion' })
    expect(sectionForPath('/mapas/reorganizacion')).toBe('maps')
    expect(resourceInSections({ formato: 'mapa', ruta: '/mapas/reorganizacion' }, new Set(['maps']))).toBe(true)
    expect(resourceInSections({ formato: 'mapa', ruta: '/mapas/reorganizacion' }, new Set(['infrastructure']))).toBe(false)

    const mapsOnly: SectionPolicy = { enabledSections: ['maps'], landing: false }
    const noMaps: SectionPolicy = { enabledSections: ['infrastructure'], landing: false }
    for (const destination of ['/mapas/reorganizacion', '/mapas/natalidad']) {
      expect(safeDestination({ policy: mapsOnly, destination, allowedByExistingAcl: () => true })?.path).toBe(destination)
      expect(safeDestination({ policy: noMaps, destination, allowedByExistingAcl: () => true })).toBeNull()
      expect(safeDestination({ policy: mapsOnly, destination, allowedByExistingAcl: () => false })).toBeNull()
    }
  })

  it('allows reports-only destination and registered GE special destination without a hub section grant', () => {
    expect(safeDestination({ policy: { enabledSections: ['reports'], landing: false }, destination: '/reportes?formato=mapa', allowedByExistingAcl: () => true })?.path).toBe('/reportes')
    expect(safeDestination({ policy: { enabledSections: [], landing: false }, destination: '/problematicas/parte/nuevo', allowedByExistingAcl: () => true })?.kind).toBe('special')
  })
})
