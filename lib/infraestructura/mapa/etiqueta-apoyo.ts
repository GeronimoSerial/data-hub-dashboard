import type { ApoyoPedagogico, EstadoClases } from './tipos'

/** Comparte la etiqueta de asistencia pedagógica entre la lista y la ficha de la escuela. */
export function etiquetaApoyoMapa(clases: EstadoClases, apoyo: ApoyoPedagogico): string | null {
  if (clases === 'normal' || apoyo === null) return null
  switch (apoyo) {
    case 'sin_dato': return 'Asistencia pedagógica sin dato'
    case 'no': return 'No se brinda asistencia pedagógica'
    case 'brinda': return 'Se brinda asistencia pedagógica'
    case 'virtual': return 'Asistencia pedagógica: clase virtual'
    case 'cuadernillo': return 'Asistencia pedagógica: cuadernillo'
    case 'ambos': return 'Asistencia pedagógica: clase virtual y cuadernillo'
  }
}
