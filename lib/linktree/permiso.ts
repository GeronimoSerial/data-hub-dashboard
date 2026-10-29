import type { SessionUser } from '@/lib/acl'

/** Customizing the public page is an admin-only action; editors cannot change it. */
export function soloAdminDenegado(user: SessionUser | null) {
  if (!user) return { status: 401 as const, error: 'No autenticado' }
  if (user.banned || user.role !== 'admin')
    return { status: 403 as const, error: 'No tiene acceso a este recurso' }
  return null
}
