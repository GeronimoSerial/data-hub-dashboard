import type { ApoyoPedagogico, EstadoClases } from './tipos'

/** Comparte la etiqueta de apoyo entre la lista y la ficha de la escuela. */
export function etiquetaApoyoMapa(clases: EstadoClases, apoyo: ApoyoPedagogico): string | null {
  if (clases === 'normal' || apoyo === null) return null
  if (apoyo === 'no') return 'Sin apoyo'
  if (apoyo === 'virtual') return 'Apoyo virtual'
  if (apoyo === 'cuadernillo') return 'Cuadernillo'
  return 'Virtual y cuadernillo'
}
