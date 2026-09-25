export type Role = 'admin' | 'editor' | 'consulta'

export type SessionUser = {
  id: string
  role: Role
  banned: boolean
  nivelIds: string[]
  // 'todos' | 'seleccionados': si es 'seleccionados', puedeAbrir restringe al
  // usuario consulta a los recursos listados en recursoIds, antes de aplicar
  // la audiencia propia del recurso.
  accesoRecursos: 'todos' | 'seleccionados'
  recursoIds: string[]
}

export type RecursoAccess = {
  id: string
  estado: 'publicado' | 'borrador'
  audienciaNivelIds: string[]
  audienciaUserIds: string[]
}

export function puedeAbrir(
  user: SessionUser | null,
  recurso: RecursoAccess,
): boolean {
  if (!user) return false
  if (user.banned) return false
  if (recurso.estado === 'borrador' && user.role === 'consulta') return false
  if (user.role === 'admin' || user.role === 'editor') return true
  if (
    user.accesoRecursos === 'seleccionados' &&
    !user.recursoIds.includes(recurso.id)
  )
    return false
  const noAudience =
    recurso.audienciaNivelIds.length === 0 &&
    recurso.audienciaUserIds.length === 0
  if (noAudience) return true
  if (recurso.audienciaUserIds.includes(user.id)) return true
  return user.nivelIds.some((id) => recurso.audienciaNivelIds.includes(id))
}

export function isStaff(role: Role | null | undefined) {
  return role === 'admin' || role === 'editor'
}

export function adminPageGate(
  user: SessionUser | null,
): 'login' | 'forbidden' | 'ok' {
  if (!user) return 'login'
  if (user.banned || !isStaff(user.role)) return 'forbidden'
  return 'ok'
}
