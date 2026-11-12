import { can } from '@/lib/access/capabilities'
import type { SessionUser } from '@/lib/acl'

/** Guarda de las APIs del call center: exige la capacidad `callcenter.access`. */
export function callCenterGuard(user: SessionUser | null) {
  if (!user) return { status: 401 as const, error: 'No autenticado' }
  if (!can(user, 'callcenter.access'))
    return { status: 403 as const, error: 'No tiene acceso a este recurso' }
  return null
}

/** Guarda de la página del call center. */
export function callCenterPageGate(user: SessionUser | null): 'login' | 'forbidden' | 'ok' {
  if (!user) return 'login'
  return can(user, 'callcenter.access') ? 'ok' : 'forbidden'
}
