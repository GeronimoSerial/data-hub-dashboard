import type { SessionUser } from '@/lib/acl'
import { alcanceMapa } from '@/lib/infraestructura/alcance-mapa'
import {
  canUseLanding,
  effectiveSections,
  type HubSection,
} from '@/lib/hub-sections'

/**
 * Capacidades nombradas: la unidad que declara cada página y API en
 * lib/access/route-manifest.ts. Un cambio de rol o de política se expresa
 * acá, en capabilitiesFor, y no en guardas dispersas por ruta.
 */
export const ALL_CAPABILITIES = [
  'public',
  'authenticated',
  'staff',
  'admin',
  'hub.landing',
  'hub.explore',
  'hub.section.reports',
  'hub.section.maps',
  'hub.section.dashboards',
  'hub.section.infrastructure',
  'hub.section.situation',
  'hub.section.cuadernillos',
  'hub.recursos',
  'infra.map.read',
  'infra.cargar',
  'parte.access',
  'callcenter.access',
] as const

export type Capability = (typeof ALL_CAPABILITIES)[number]

const SECTION_CAPABILITY: Record<HubSection, Capability> = {
  explore: 'hub.explore',
  reports: 'hub.section.reports',
  maps: 'hub.section.maps',
  dashboards: 'hub.section.dashboards',
  infrastructure: 'hub.section.infrastructure',
  situation: 'hub.section.situation',
  cuadernillos: 'hub.section.cuadernillos',
}

/** Única política rol -> capacidades. */
export function capabilitiesFor(user: SessionUser | null): ReadonlySet<Capability> {
  if (!user || user.banned) return new Set<Capability>(['public'])
  const caps = new Set<Capability>(['authenticated'])
  switch (user.role) {
    case 'admin':
      for (const cap of ALL_CAPABILITIES) caps.add(cap)
      break
    case 'editor':
      for (const cap of ALL_CAPABILITIES) if (cap !== 'admin') caps.add(cap)
      break
    case 'admin_ge':
      caps.add('infra.map.read')
      caps.add('infra.cargar')
      break
    case 'director_nivel':
      if (alcanceMapa(user).tipo !== 'ninguno') caps.add('infra.map.read')
      caps.add('infra.cargar')
      caps.add('parte.access')
      break
    case 'operador_establecimiento':
      caps.add('parte.access')
      break
    case 'consulta': {
      const policy = user.hubPolicy ?? {}
      if (canUseLanding(policy)) caps.add('hub.landing')
      for (const section of effectiveSections(policy)) {
        caps.add(SECTION_CAPABILITY[section])
        if (section === 'infrastructure') caps.add('infra.map.read')
      }
      caps.add('hub.recursos')
      break
    }
  }
  return caps
}

export function can(user: SessionUser | null, cap: Capability): boolean {
  return capabilitiesFor(user).has(cap)
}
