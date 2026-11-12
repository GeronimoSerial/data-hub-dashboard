import { puedeAbrir, type RecursoAccess, type SessionUser } from '@/lib/acl'
import { can } from '@/lib/access/capabilities'
import { loadRecursoAccessByRuta } from '@/lib/db/recurso-access'
import { getSessionUser } from '@/lib/session'
import { effectiveSections, type HubSection } from '@/lib/hub-sections'
import { RUTA_MAPA_INFRAESTRUCTURA } from '@/lib/infraestructura/rutas-hub'

export type AccesoLectura =
  | { ok: true; user: SessionUser }
  | { ok: false; status: 401 }
  | { ok: false; status: 403 }

/** Apertura del recurso del mapa con su excepción de lista de permitidos (S8), que vive en lib/acl.ts. */
export function puedeAbrirMapaInfraestructura(
  user: SessionUser | null,
  recurso: RecursoAccess,
): boolean {
  return puedeAbrir(user, { ...recurso, ruta: RUTA_MAPA_INFRAESTRUCTURA })
}

/**
 * Única decisión de lectura del mapa de infraestructura, compartida por páginas
 * y APIs. La capacidad `infra.map.read` (lib/access/capabilities.ts) ya cubre
 * sección, alcance por nivel y rol. El recurso sólo restringe a consulta, que
 * es la forma en que el administrador limita a esos usuarios.
 */
export function puedeLeerMapaInfraestructura(
  user: SessionUser | null,
  recursoAccess: RecursoAccess | null,
): boolean {
  if (!can(user, 'infra.map.read')) return false
  if (user?.role !== 'consulta') return true
  return recursoAccess !== null && puedeAbrirMapaInfraestructura(user, recursoAccess)
}

export async function verificarAccesoLectura(
  _options: { section?: 'infrastructure' } = {},
): Promise<AccesoLectura> {
  const user = await getSessionUser()
  if (!user) return { ok: false, status: 401 }

  const found = await loadRecursoAccessByRuta(RUTA_MAPA_INFRAESTRUCTURA)
  if (!puedeLeerMapaInfraestructura(user, found?.access ?? null)) return { ok: false, status: 403 }

  return { ok: true, user }
}

/** Checks authenticated section membership without imposing a resource ACL.
 * Use only where the owning page policy is section + role, not resource access.
 */
export async function verificarAccesoSeccion(section: HubSection): Promise<AccesoLectura> {
  const user = await getSessionUser()
  if (!user) return { ok: false, status: 401 }
  if (!effectiveSections(user.hubPolicy ?? {}).has(section)) return { ok: false, status: 403 }
  return { ok: true, user }
}
