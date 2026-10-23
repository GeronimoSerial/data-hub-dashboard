export type Role =
  | 'admin'
  | 'editor'
  | 'consulta'
  | 'director_nivel'
  | 'operador_establecimiento'

export type SessionUser = {
  id: string
  role: Role
  banned: boolean
  nivelJurIds: number[]
  // 'todos' | 'seleccionados': si es 'seleccionados', puedeAbrir restringe al
  // usuario consulta a los recursos listados en recursoIds, antes de aplicar
  // la audiencia propia del recurso.
  accesoRecursos: 'todos' | 'seleccionados'
  recursoIds: string[]
  // CUE-anexo del establecimiento del operador (ge_cue_anexo, lo puebla T6).
  cueAnexo?: string | null
  hubPolicy?: SectionPolicy
  hubDestination?: string | null
}

export type RecursoAccess = {
  id: string
  estado: 'publicado' | 'borrador'
  audienciaNivelJurIds: number[]
  audienciaUserIds: string[]
}

import {
  effectiveSections,
  resourceInSections,
  type SectionPolicy,
} from './hub-sections'

/** Adds section membership as an extra denial only; callers must still use puedeAbrir. */
export function puedeVerEnSeccion(
  user: SessionUser | null,
  resource: RecursoAccess & { formato: 'reporte' | 'tablero' | 'mapa'; ruta?: string | null },
  policy: SectionPolicy = {},
): boolean {
  if (!puedeAbrir(user, resource)) return false
  return resourceInSections(resource, effectiveSections(policy))
}

export function puedeAbrir(
  user: SessionUser | null,
  recurso: RecursoAccess,
): boolean {
  if (!user) return false
  if (user.banned) return false
  if (recurso.estado === 'borrador' && !isStaff(user.role)) return false
  if (user.role === 'admin' || user.role === 'editor') return true
  if (
    user.accesoRecursos === 'seleccionados' &&
    !user.recursoIds.includes(recurso.id)
  )
    return false
  const noAudience =
    recurso.audienciaNivelJurIds.length === 0 &&
    recurso.audienciaUserIds.length === 0
  if (noAudience) return true
  if (recurso.audienciaUserIds.includes(user.id)) return true
  return user.nivelJurIds.some((id) => recurso.audienciaNivelJurIds.includes(id))
}

// Cualquier item de catálogo (Recurso, RecursoAccess) que traiga estos campos
// puede filtrarse con la misma regla de puedeAbrir. Las audiencias son
// opcionales acá porque `Recurso` las declara opcionales; se normalizan a []
// antes de delegar en puedeAbrir.
type FiltrableAccess = {
  id: string
  estado: 'publicado' | 'borrador'
  audienciaNivelJurIds?: number[]
  audienciaUserIds?: string[]
}

export type NivelAcceso = 'abrir' | 'ingresar' | 'restringido'

/** Nivel de acceso de un recurso para el visitante actual, sin filtrar el
 *  catálogo: anónimo -> 'ingresar' (requiere loguearse para saber si puede);
 *  con sesión y puedeAbrir -> 'abrir'; con sesión pero sin permiso ->
 *  'restringido' (consulta+seleccionados sin ese id, o audiencia que lo
 *  excluye). */
export function accesoDe<T extends FiltrableAccess>(
  user: SessionUser | null,
  recurso: T,
): NivelAcceso {
  if (!user) return 'ingresar'
  const puede = puedeAbrir(user, {
    id: recurso.id,
    estado: recurso.estado,
    audienciaNivelJurIds: recurso.audienciaNivelJurIds ?? [],
    audienciaUserIds: recurso.audienciaUserIds ?? [],
  })
  return puede ? 'abrir' : 'restringido'
}

/** Marca cada recurso del catálogo con su nivel de acceso (accesoDe) sin
 *  quitar ninguno: el catálogo vuelve a mostrar todo lo publicado y cada
 *  superficie (tarjeta, relacionados) decide cómo presentar el candado. */
export function marcarAcceso<T extends FiltrableAccess>(
  user: SessionUser | null,
  items: T[],
): (T & { acceso: NivelAcceso })[] {
  return items.map((item) => ({ ...item, acceso: accesoDe(user, item) }))
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
