import type { Recurso } from '@/lib/model'

export const HUB_SECTIONS = [
  'explore',
  'reports',
  'maps',
  'dashboards',
  'infrastructure',
  'situation',
] as const

export type HubSection = (typeof HUB_SECTIONS)[number]

export type HubDestination =
  | { kind: 'landing'; path: '/' }
  | { kind: 'section'; section: HubSection; path: string }
  | { kind: 'special'; path: '/problematicas/parte/nuevo' }

export const HUB_DESTINATIONS: readonly HubDestination[] = [
  { kind: 'landing', path: '/' },
  { kind: 'section', section: 'explore', path: '/explorar' },
  { kind: 'section', section: 'reports', path: '/reportes' },
  { kind: 'section', section: 'maps', path: '/mapas' },
  { kind: 'section', section: 'dashboards', path: '/tableros' },
  { kind: 'section', section: 'infrastructure', path: '/mapas/infraestructura' },
  { kind: 'section', section: 'situation', path: '/situacion' },
  { kind: 'section', section: 'maps', path: '/mapas/matricula' },
  { kind: 'section', section: 'maps', path: '/mapas/natalidad' },
  { kind: 'section', section: 'maps', path: '/mapas/reorganizacion' },
  { kind: 'section', section: 'dashboards', path: '/tablero' },
  { kind: 'section', section: 'maps', path: '/mapa_interactivo' },
  { kind: 'section', section: 'maps', path: '/mapa_sobreedad' },
  { kind: 'section', section: 'maps', path: '/mapa_notas' },
  // Existing GE operator entry; this public workflow is not a hub section.
  { kind: 'special', path: '/problematicas/parte/nuevo' },
]

const DESTINATION_PATHS = new Set(HUB_DESTINATIONS.map(({ path }) => path))

export type SectionPolicy = {
  /** undefined means legacy compatibility, [] is an explicit deny-all. */
  enabledSections?: readonly HubSection[]
  /** undefined means legacy landing access; false explicitly denies landing. */
  landing?: boolean
}

export const LEGACY_SECTION_POLICY: Readonly<Required<SectionPolicy>> = {
  enabledSections: HUB_SECTIONS,
  landing: true,
}

export function effectiveSections(policy: SectionPolicy): ReadonlySet<HubSection> {
  return new Set(policy.enabledSections ?? LEGACY_SECTION_POLICY.enabledSections)
}

export function canUseLanding(policy: SectionPolicy): boolean {
  return policy.landing ?? LEGACY_SECTION_POLICY.landing
}

/** Normalize persisted values without collapsing legacy NULL and explicit []. */
export function normalizeSectionPolicy(value: { enabledSections?: unknown; landing?: unknown } | null | undefined): SectionPolicy {
  if (!value) return {}
  const enabledSections = value.enabledSections === null || value.enabledSections === undefined
    ? undefined
    : Array.isArray(value.enabledSections) && value.enabledSections.every((section) =>
      typeof section === 'string' && (HUB_SECTIONS as readonly string[]).includes(section),
    ) ? [...new Set(value.enabledSections as HubSection[])] : []
  return {
    ...(enabledSections !== undefined ? { enabledSections } : {}),
    ...(typeof value.landing === 'boolean' ? { landing: value.landing } : {}),
  }
}

export function isHubSection(value: unknown): value is HubSection {
  return typeof value === 'string' && (HUB_SECTIONS as readonly string[]).includes(value)
}

/** Classify routes before considering query filters. Unknown paths fail closed. */
export function sectionForPath(path: string): HubSection | 'landing' | null {
  const pathname = safePathname(path)
  if (!pathname) return null
  if (pathname === '/') return 'landing'
  if (pathname === '/explorar') return 'explore'
  if (pathname === '/reportes') return 'reports'
  if (pathname === '/mapas/infraestructura' || pathname.startsWith('/mapas/infraestructura/')) return 'infrastructure'
  if (pathname === '/infraestructura/cargar' || pathname.startsWith('/infraestructura/cargar/')) return 'infrastructure'
  if (pathname === '/situacion') return 'situation'
  if (pathname === '/tableros' || pathname === '/tablero' || pathname.startsWith('/tablero/')) return 'dashboards'
  if (pathname === '/mapas' || pathname.startsWith('/mapas/') || ['/mapa_interactivo', '/mapa_sobreedad', '/mapa_notas'].includes(pathname)) return 'maps'
  if (pathname === '/recursos' || pathname.startsWith('/recursos/')) return 'explore'
  return null
}

/** Return all content sections a resource belongs to, based on trusted data. */
export function sectionsForResource(resource: { formato: Recurso['formato']; ruta?: string | null }): ReadonlySet<HubSection> {
  // A specific trusted route overrides broad storage format (e.g. a mapa
  // resource routed to infrastructure must not also require the maps grant).
  if (resource.ruta) {
    const routeSection = sectionForPath(resource.ruta)
    if (routeSection && routeSection !== 'landing') return new Set([routeSection])
  }
  const sections = new Set<HubSection>()
  switch (resource.formato) {
    case 'reporte': sections.add('reports'); break
    case 'mapa': sections.add('maps'); break
    case 'tablero': sections.add('dashboards'); break
  }
  return sections
}

export function resourceInSections(
  resource: { formato: Recurso['formato']; ruta?: string | null },
  enabled: ReadonlySet<HubSection>,
): boolean {
  const membership = sectionsForResource(resource)
  return membership.size > 0 && [...membership].every((section) => enabled.has(section))
}

export type DestinationPolicyInput = {
  policy: SectionPolicy
  destination: string
  allowedByExistingAcl: (path: string) => boolean
}

/** Validate only registry-owned internal destinations. Callback parameters are ignored. */
export function safeDestination({ policy, destination, allowedByExistingAcl }: DestinationPolicyInput): HubDestination | null {
  const pathname = safePathname(destination)
  if (!pathname || !DESTINATION_PATHS.has(pathname)) return null
  const descriptor = HUB_DESTINATIONS.find((entry) => entry.path === pathname)
  if (!descriptor) return null
  if (descriptor.kind === 'landing')
    return canUseLanding(policy) && allowedByExistingAcl(pathname) ? descriptor : null
  if (descriptor.kind === 'special') return allowedByExistingAcl(pathname) ? descriptor : null
  if (!effectiveSections(policy).has(descriptor.section)) return null
  return allowedByExistingAcl(pathname) ? descriptor : null
}

export function safePathname(value: string): string | null {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(value)) return null
  if (/%2f|%5c/i.test(value)) return null
  let decoded: string
  try { decoded = decodeURIComponent(value) } catch { return null }
  if (/[\\\u0000-\u001f\u007f]/.test(decoded) || /%2f|%5c/i.test(decoded) || decoded.startsWith('//') || decoded.split(/[?#]/, 1)[0].split('/').some((part) => part === '.' || part === '..')) return null
  try {
    const url = new URL(value, 'https://hub.invalid')
    if (url.origin !== 'https://hub.invalid') return null
    return url.pathname
  } catch { return null }
}
