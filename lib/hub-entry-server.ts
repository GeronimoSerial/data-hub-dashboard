import { adminPageGate, puedeAbrir, puedeVerEnSeccion, type SessionUser } from '@/lib/acl'
import { puedeLeerMapaInfraestructura } from '@/lib/infraestructura/acceso-lectura'
import { getDb } from '@/lib/db'
import { recursos } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { loadRecursoAccess, loadRecursoAccessByRuta } from '@/lib/db/recurso-access'
import type { Formato } from '@/lib/model'
import { pathAllowedByHubPolicy, resolveHubEntry } from '@/lib/hub-entry'
import { hubConfined } from '@/lib/access/hub-confinement'
import { sectionsForUser, type HubSection } from '@/lib/hub-sections'
import { legacyRecursoRedirect } from '@/lib/nav'
import { notFound, redirect } from 'next/navigation'
import { moduloDeRutaHabilitado } from '@/lib/infraestructura/region/modulos'
import { getSessionUser } from '@/lib/session'
import { RUTA_MAPA_INFRAESTRUCTURA } from '@/lib/infraestructura/rutas-hub'

async function resourceEntryAllowed(user: SessionUser, id: string) {
  const [row] = await getDb().select({ id: recursos.id, formato: recursos.formato, ruta: recursos.ruta })
    .from(recursos).where(eq(recursos.id, id)).limit(1)
  if (!row) return false
  const access = await loadRecursoAccess(id)
  if (!access) return false
  return puedeVerEnSeccion(user, {
    ...access,
    formato: row.formato as Formato,
    ruta: row.ruta,
  }, user.hubPolicy)
}

export async function serverHubPathAllowedByPolicy(user: SessionUser, path: string) {
  if (hubConfined(user)) return pathAllowedByHubPolicy(path, user)
  const resourcePath = path.match(/^\/recursos\/([^/]+)$/)
  if (resourcePath) return resourceEntryAllowed(user, decodeURIComponent(resourcePath[1]))
  return pathAllowedByHubPolicy(path, user)
}

/** API denial response for a protected hub path; never redirects API clients to HTML. */
export async function hubApiAccessResponse(user: SessionUser | null, path: string) {
  const headers = { 'Cache-Control': 'private, no-store' }
  if (!moduloDeRutaHabilitado(path)) return Response.json({ error: 'No encontrado' }, { status: 404, headers })
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401, headers })
  if (!(await serverHubPathAllowedByPolicy(user, path))) {
    return Response.json({ error: 'No tiene acceso a este recurso' }, { status: 403, headers })
  }
  return null
}

export async function serverHubPathAllowedByExistingAcl(user: SessionUser, path: string) {
  if (user.banned) return false
  if (path === '/') return true
  if (path === '/problematicas/parte/nuevo') {
    return user.role === 'operador_establecimiento' && Boolean(user.cueAnexo)
  }
  if (path === '/situacion') return adminPageGate(user) === 'ok'

  const canonicalPath = legacyRecursoRedirect(path) ?? path
  const resourcePath = canonicalPath.match(/^\/recursos\/([^/]+)$/)
  if (resourcePath) return resourceEntryAllowed(user, decodeURIComponent(resourcePath[1]))

  const infrastructurePath = path === RUTA_MAPA_INFRAESTRUCTURA || path.startsWith(`${RUTA_MAPA_INFRAESTRUCTURA}/`)
  if (infrastructurePath) {
    // Same decision as the infra map pages and APIs; exempt from the allow-list (S8).
    const found = await loadRecursoAccessByRuta(RUTA_MAPA_INFRAESTRUCTURA)
    return Boolean(found && puedeLeerMapaInfraestructura(user, found.access))
  }
  const resourceRoute = ['/mapas/matricula', '/mapas/natalidad', '/mapas/reorganizacion'].find((route) => path === route)
  if (resourceRoute) {
    const found = await loadRecursoAccessByRuta(resourceRoute)
    return Boolean(found && puedeAbrir(user, found.access))
  }
  return true
}

export async function resolveServerHubEntry(
  user: SessionUser,
  options: { callbackUrl?: unknown; currentPath?: string } = {},
) {
  return resolveHubEntry({
    user,
    ...options,
    allowedByHubPolicy: (path) => serverHubPathAllowedByPolicy(user, path),
    allowedByExistingAcl: (path) => serverHubPathAllowedByExistingAcl(user, path),
  })
}

/** Page-level authorization. Shared layouts may be reused during client navigation. */
export async function requireServerHubPageAccess(path: string, requiredSection?: HubSection) {
  if (!moduloDeRutaHabilitado(path)) notFound()
  const user = await getSessionUser()
  if (!user) redirect(`/login?callbackUrl=${encodeURIComponent(path)}`)
  if (user.banned) redirect('/forbidden')
  const sectionAllowed = requiredSection && !hubConfined(user)
    ? sectionsForUser(user).has(requiredSection)
    : await serverHubPathAllowedByPolicy(user, path)
  if (!sectionAllowed
    || !(await serverHubPathAllowedByExistingAcl(user, path))) {
    if (path === '/' || hubConfined(user)) {
      const destination = await resolveServerHubEntry(user, { currentPath: '/' })
      redirect(destination ?? '/forbidden')
    }
    redirect('/forbidden')
  }
  return user
}
