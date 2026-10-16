import type { SessionUser } from '@/lib/acl'
import { normalizeCue } from '@/lib/infraestructura/cue'

/*
  Decisión pura del acceso al parte según el rol de la sesión (sin base, sin
  cookies). La composición con la sesión real vive en acceso-parte.ts.

  - operador_establecimiento: el CUE es el de su sesión. Sin ?cue se usa ése;
    con un ?cue distinto se niega.
  - director_nivel: elige el CUE por URL, pero sólo si el nivel jurisdiccional
    de ese CUE está entre sus niveles asignados.
  - admin: sin cambios (acceso completo); el resto de los roles no entra por
    sesión.
*/

export type DecisionAccesoParte = {
  permitido: boolean
  /** CUE normalizado que debe usar la pantalla o la API; null si no hay ninguno. */
  cue: string | null
}

export type UsuarioSesionParte =
  | (Pick<SessionUser, 'role' | 'banned' | 'nivelJurIds'> & { cueAnexo?: string | null })
  | null

export function accesoParteSesion(
  user: UsuarioSesionParte,
  cuePedido: string | null | undefined,
  nivelDeCue: number | null,
): DecisionAccesoParte {
  const pedido = normalizeCue(cuePedido ?? '')?.value ?? null
  if (!user || user.banned) return { permitido: false, cue: pedido }

  if (user.role === 'admin') return { permitido: true, cue: pedido }

  if (user.role === 'operador_establecimiento') {
    const propio = normalizeCue(user.cueAnexo ?? '')?.value ?? null
    if (!propio) return { permitido: false, cue: pedido }
    if (pedido !== null && pedido !== propio) return { permitido: false, cue: pedido }
    return { permitido: true, cue: propio }
  }

  if (user.role === 'director_nivel') {
    if (pedido === null || nivelDeCue === null) return { permitido: false, cue: pedido }
    return { permitido: user.nivelJurIds.includes(nivelDeCue), cue: pedido }
  }

  return { permitido: false, cue: pedido }
}
