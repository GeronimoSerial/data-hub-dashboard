import type { SessionUser } from '@/lib/acl'

// Alcance de los datos del mapa de infraestructura según el rol del usuario.
// Función pura: la usan las rutas del servidor (filtro real) y la UI (opciones
// del filtro "Dirección"). No reemplaza a puedeAbrir: sólo decide qué
// establecimientos se devuelven.
export type AlcanceMapa =
  | { tipo: 'todo' }
  | { tipo: 'niveles'; ids: number[] }
  | { tipo: 'ninguno' }

type UsuarioAlcance = Pick<SessionUser, 'role' | 'banned' | 'nivelJurIds'> | null

export function alcanceMapa(user: UsuarioAlcance): AlcanceMapa {
  if (!user || user.banned) return { tipo: 'ninguno' }
  switch (user.role) {
    case 'admin':
    case 'editor':
    case 'consulta':
      return { tipo: 'todo' }
    case 'director_nivel':
      return user.nivelJurIds.length > 0
        ? { tipo: 'niveles', ids: [...user.nivelJurIds] }
        : { tipo: 'ninguno' }
    default:
      return { tipo: 'ninguno' }
  }
}

// Filtros de establecimiento que impone el alcance. 'todo' no restringe nada;
// 'ninguno' no debería llegar hasta acá (la ruta responde 403 antes).
export function filtrosDeAlcance(alcance: AlcanceMapa): { nivelesJurIds?: number[] } {
  return alcance.tipo === 'niveles' ? { nivelesJurIds: alcance.ids } : {}
}
