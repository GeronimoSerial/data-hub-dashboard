import type { EscuelaMapaEnriquecida, GravedadMapa } from './tipos'

export type IconoPunto = 'sin' | 'parcial' | 'evacuado' | 'centro' | 'reloj'

export function iconoPunto(escuela: EscuelaMapaEnriquecida): IconoPunto | null {
  if (escuela.clases !== 'normal') return escuela.clases
  return escuela.sinActualizar ? 'reloj' : null
}

export function radioPunto(gravedad: GravedadMapa): number {
  return gravedad === 0 ? 5 : 8
}
