import type { Role, SessionUser } from '@/lib/acl'
import { safePathname } from '@/lib/hub-sections'
import { can, type Capability } from './capabilities'
import { RUTA_MAPA_INFRAESTRUCTURA } from '@/lib/infraestructura/rutas-hub'

/**
 * Confined users never enter the hub: they reach only their own area.
 * A user is confined when it lacks `hub.recursos`, the capability every
 * non-confined role holds. Pure and client-safe.
 */
export function hubConfined(user: SessionUser | null): boolean {
  return Boolean(user) && !can(user, 'hub.recursos')
}

/** Client-side variant for the shell, which only knows the role. */
export function roleIsHubConfined(role: Role | null | undefined): boolean {
  if (!role) return false
  return hubConfined({ id: '', role, banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [] })
}

function isSchoolOperator(user: SessionUser): boolean {
  return user.role === 'operador_establecimiento' && Boolean(user.cueAnexo?.trim())
}

// Hub paths a confined user may reach, and the capability that grants each.
// `allowed` narrows a capability that other confined roles also hold.
const CONFINED_AREAS: ReadonlyArray<{
  pattern: RegExp
  capability: Capability
  allowed?: (user: SessionUser) => boolean
}> = [
  { pattern: /^\/mapas\/infraestructura(\/|$)/, capability: 'infra.map.read' },
  { pattern: /^\/infraestructura\/cargar(\/|$)/, capability: 'infra.cargar' },
  { pattern: /^\/problematicas\/parte\/nuevo$/, capability: 'parte.access' },
  { pattern: /^\/call-center(\/|$)/, capability: 'callcenter.access' },
  // Booklet receipt for schools: only these three exact paths of /cuadernillos and /api/cuadernillos.
  ...[
    /^\/cuadernillos\/recepcion\/?$/,
    /^\/api\/cuadernillos\/recepciones\/?$/,
    /^\/api\/cuadernillos\/remito-lineas\/[^/]+\/recibir\/?$/,
  ].map((pattern) => ({ pattern, capability: 'parte.access' as const, allowed: isSchoolOperator })),
]

/** Path of the school receipt page, the one booklet entry a confined school operator gets in the shell. */
export const SCHOOL_RECEIPT_PATH = '/cuadernillos/recepcion'

export function confinedAreaCapability(path: string): Capability | null {
  const pathname = safePathname(path)
  if (!pathname) return null
  return CONFINED_AREAS.find(({ pattern }) => pattern.test(pathname))?.capability ?? null
}

/** Whether a confined user holds the capability behind this path. Non-confined users never reach here. */
export function confinedPathAllowed(user: SessionUser, path: string): boolean {
  if (user.banned) return false
  const pathname = safePathname(path)
  const area = pathname ? CONFINED_AREAS.find(({ pattern }) => pattern.test(pathname)) : undefined
  return area !== undefined && can(user, area.capability) && (area.allowed?.(user) ?? true)
}

/** Post-login home of a confined user, or null when the user is not confined or has no area. */
export function confinedHome(user: SessionUser | null): string | null {
  if (!user || user.banned || !hubConfined(user)) return null
  if (user.role === 'operador_establecimiento' && user.cueAnexo && can(user, 'parte.access')) return '/problematicas/parte/nuevo'
  if (can(user, 'infra.map.read')) return RUTA_MAPA_INFRAESTRUCTURA
  return null
}
