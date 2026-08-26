export type Role = 'admin' | 'editor' | 'consulta'

export type SessionUser = {
  id: string
  role: Role
  banned: boolean
  nivelIds: string[]
}

export type RecursoAccess = {
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
  const noAudience =
    recurso.audienciaNivelIds.length === 0 &&
    recurso.audienciaUserIds.length === 0
  if (noAudience) return true
  if (recurso.audienciaUserIds.includes(user.id)) return true
  return user.nivelIds.some((id) => recurso.audienciaNivelIds.includes(id))
}

export function isStaff(role: Role) {
  return role === 'admin' || role === 'editor'
}
