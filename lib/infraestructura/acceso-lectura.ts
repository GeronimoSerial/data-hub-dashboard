import { puedeAbrir, type SessionUser } from '@/lib/acl'
import { loadRecursoAccessByRuta } from '@/lib/db/recurso-access'
import { getSessionUser } from '@/lib/session'

export type AccesoLectura =
  | { ok: true; user: SessionUser }
  | { ok: false; status: 401 }
  | { ok: false; status: 403 }

export async function verificarAccesoLectura(): Promise<AccesoLectura> {
  const user = await getSessionUser()
  if (!user) return { ok: false, status: 401 }

  const found = await loadRecursoAccessByRuta('/mapas/infraestructura')
  if (!found) return { ok: false, status: 403 }

  if (!puedeAbrir(user, found.access)) return { ok: false, status: 403 }

  return { ok: true, user }
}
