import { puedeAbrir, type SessionUser } from '@/lib/acl'
import { loadRecursoAccessByRuta } from '@/lib/db/recurso-access'
import { getSessionUser } from '@/lib/session'
import { effectiveSections } from '@/lib/hub-sections'
import type { HubSection } from '@/lib/hub-sections'

export type AccesoLectura =
  | { ok: true; user: SessionUser }
  | { ok: false; status: 401 }
  | { ok: false; status: 403 }

export async function verificarAccesoLectura(options: { section?: 'infrastructure' } = {}): Promise<AccesoLectura> {
  const user = await getSessionUser()
  if (!user) return { ok: false, status: 401 }
  const section = options.section ?? 'infrastructure'
  if (!effectiveSections(user.hubPolicy ?? {}).has(section)) {
    return { ok: false, status: 403 }
  }

  const found = await loadRecursoAccessByRuta('/mapas/infraestructura')
  if (!found) return { ok: false, status: 403 }

  if (!puedeAbrir(user, found.access)) return { ok: false, status: 403 }

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
