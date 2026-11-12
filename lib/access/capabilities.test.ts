import { describe, expect, it } from 'vitest'
import type { SessionUser } from '@/lib/acl'
import { ALL_CAPABILITIES, can, capabilitiesFor, type Capability } from './capabilities'

const base: SessionUser = {
  id: 'u1',
  role: 'consulta',
  banned: false,
  nivelJurIds: [],
  accesoRecursos: 'todos',
  recursoIds: [],
}

const user = (overrides: Partial<SessionUser>): SessionUser => ({ ...base, ...overrides })

const sorted = (set: ReadonlySet<Capability>) => [...set].sort()

describe('capabilitiesFor', () => {
  it('sin sesion solo tiene public', () => {
    expect(sorted(capabilitiesFor(null))).toEqual(['public'])
  })

  it('usuario baneado solo tiene public, aunque sea admin', () => {
    expect(sorted(capabilitiesFor(user({ role: 'admin', banned: true })))).toEqual(['public'])
  })

  it('admin tiene todas las capacidades', () => {
    expect(sorted(capabilitiesFor(user({ role: 'admin' })))).toEqual([...ALL_CAPABILITIES].sort())
  })

  it('editor tiene todas las capacidades excepto admin', () => {
    const caps = capabilitiesFor(user({ role: 'editor' }))
    expect(caps.has('admin')).toBe(false)
    expect(sorted(caps)).toEqual(ALL_CAPABILITIES.filter((cap) => cap !== 'admin').sort())
  })

  it('director_nivel con niveles asignados ve el mapa de infraestructura y puede cargar partes', () => {
    const caps = capabilitiesFor(user({ role: 'director_nivel', nivelJurIds: [3] }))
    expect(sorted(caps)).toEqual(['authenticated', 'infra.cargar', 'infra.map.read', 'parte.access'].sort())
  })

  it('director_nivel sin niveles no ve el mapa, pero conserva cargar y parte', () => {
    const caps = capabilitiesFor(user({ role: 'director_nivel', nivelJurIds: [] }))
    expect(sorted(caps)).toEqual(['authenticated', 'infra.cargar', 'parte.access'].sort())
  })

  it('director_nivel no tiene ninguna capacidad hub', () => {
    const caps = capabilitiesFor(user({ role: 'director_nivel', nivelJurIds: [3] }))
    expect([...caps].some((cap) => cap.startsWith('hub.'))).toBe(false)
  })

  it('admin_ge solo tiene authenticated, mapa de infraestructura, cargar y call center', () => {
    const caps = capabilitiesFor(user({ role: 'admin_ge' }))
    expect(sorted(caps)).toEqual(['authenticated', 'callcenter.access', 'infra.cargar', 'infra.map.read'].sort())
  })

  it('admin_ge queda confinado y no tiene capacidades hub, staff ni parte', () => {
    const caps = capabilitiesFor(user({ role: 'admin_ge' }))
    expect(caps.has('hub.recursos')).toBe(false)
    expect(caps.has('admin')).toBe(false)
    expect(caps.has('staff' as Capability)).toBe(false)
    expect(caps.has('parte.access')).toBe(false)
    expect([...caps].some((cap) => cap.startsWith('hub.'))).toBe(false)
  })

  it('admin sin restriccion mantiene todas las capacidades aunque exista admin_ge', () => {
    const adminCaps = capabilitiesFor(user({ role: 'admin' }))
    expect(adminCaps.has('hub.recursos')).toBe(true)
    expect(adminCaps.has('admin')).toBe(true)
    expect(adminCaps.has('parte.access')).toBe(true)
  })

  it('operador_establecimiento solo tiene parte.access y authenticated', () => {
    const caps = capabilitiesFor(user({ role: 'operador_establecimiento', cueAnexo: '1-2' }))
    expect(sorted(caps)).toEqual(['authenticated', 'parte.access'].sort())
  })

  it('consulta con politica legacy tiene landing, secciones, recursos y mapa', () => {
    const caps = capabilitiesFor(user({ role: 'consulta' }))
    expect(sorted(caps)).toEqual(
      [
        'authenticated',
        'hub.explore',
        'hub.landing',
        'hub.recursos',
        'hub.section.dashboards',
        'hub.section.infrastructure',
        'hub.section.maps',
        'hub.section.reports',
        'hub.section.situation',
        'infra.map.read',
      ].sort(),
    )
  })

  it('consulta con secciones restringidas solo recibe esas capacidades', () => {
    const caps = capabilitiesFor(
      user({ role: 'consulta', hubPolicy: { enabledSections: ['reports'], landing: false } }),
    )
    expect(sorted(caps)).toEqual(['authenticated', 'hub.recursos', 'hub.section.reports'].sort())
  })

  it('consulta con landing false no recibe hub.landing aunque tenga secciones', () => {
    const caps = capabilitiesFor(
      user({ role: 'consulta', hubPolicy: { enabledSections: ['explore'], landing: false } }),
    )
    expect(caps.has('hub.landing')).toBe(false)
    expect(caps.has('hub.explore')).toBe(true)
  })

  it('consulta sin infraestructura habilitada no ve el mapa de infraestructura', () => {
    const caps = capabilitiesFor(
      user({ role: 'consulta', hubPolicy: { enabledSections: ['maps'], landing: true } }),
    )
    expect(caps.has('infra.map.read')).toBe(false)
    expect(caps.has('hub.section.infrastructure')).toBe(false)
  })

  it('callcenter.access: admin y editor la reciben', () => {
    expect(capabilitiesFor(user({ role: 'admin' })).has('callcenter.access')).toBe(true)
    expect(capabilitiesFor(user({ role: 'editor' })).has('callcenter.access')).toBe(true)
  })

  it('callcenter.access: sin sesion no la recibe', () => {
    expect(capabilitiesFor(null).has('callcenter.access')).toBe(false)
  })

  it('callcenter.access: admin baneado no la recibe', () => {
    expect(capabilitiesFor(user({ role: 'admin', banned: true })).has('callcenter.access')).toBe(false)
  })

  it('callcenter.access: operador_establecimiento no la recibe', () => {
    expect(
      capabilitiesFor(user({ role: 'operador_establecimiento', cueAnexo: '1-2' })).has('callcenter.access'),
    ).toBe(false)
  })

  it('callcenter.access: director_nivel no la recibe', () => {
    expect(capabilitiesFor(user({ role: 'director_nivel', nivelJurIds: [3] })).has('callcenter.access')).toBe(false)
  })

  it('callcenter.access: admin_ge (administrador de Gestion) la recibe', () => {
    expect(capabilitiesFor(user({ role: 'admin_ge' })).has('callcenter.access')).toBe(true)
  })

  it('callcenter.access: admin_ge baneado no la recibe', () => {
    expect(capabilitiesFor(user({ role: 'admin_ge', banned: true })).has('callcenter.access')).toBe(false)
  })

  it('callcenter.access: consulta no la recibe aunque tenga todas las secciones', () => {
    const caps = capabilitiesFor(
      user({
        role: 'consulta',
        hubPolicy: {
          enabledSections: ['explore', 'reports', 'maps', 'dashboards', 'infrastructure', 'situation'],
          landing: true,
        },
      }),
    )
    expect(caps.has('callcenter.access')).toBe(false)
  })
})

describe('can', () => {
  it('responde segun capabilitiesFor', () => {
    expect(can(user({ role: 'director_nivel', nivelJurIds: [1] }), 'infra.map.read')).toBe(true)
    expect(can(user({ role: 'director_nivel', nivelJurIds: [1] }), 'hub.landing')).toBe(false)
    expect(can(null, 'public')).toBe(true)
    expect(can(null, 'authenticated')).toBe(false)
  })
})
