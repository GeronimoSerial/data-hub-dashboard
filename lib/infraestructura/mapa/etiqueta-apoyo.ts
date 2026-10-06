import type { ApoyoPedagogico, EstadoClases } from './tipos'

const TEXTO_APOYO = {
  sin_dato: { etiqueta: 'Asistencia pedagógica sin dato', valor: 'Sin dato' },
  no: { etiqueta: 'No se brinda asistencia pedagógica', valor: 'No se brinda' },
  brinda: { etiqueta: 'Se brinda asistencia pedagógica', valor: 'Se brinda' },
  virtual: { etiqueta: 'Asistencia pedagógica: clase virtual', valor: 'Se brinda (virtual)' },
  cuadernillo: { etiqueta: 'Asistencia pedagógica: cuadernillo', valor: 'Se brinda (cuadernillo)' },
  ambos: { etiqueta: 'Asistencia pedagógica: clase virtual y cuadernillo', valor: 'Se brinda (virtual y cuadernillo)' },
} satisfies Record<Exclude<ApoyoPedagogico, null>, { etiqueta: string; valor: string }>

/** Comparte la etiqueta de asistencia pedagógica entre la lista y la ficha de la escuela. */
export function etiquetaApoyoMapa(clases: EstadoClases, apoyo: ApoyoPedagogico): string | null {
  if (clases === 'normal' || apoyo === null) return null
  return TEXTO_APOYO[apoyo].etiqueta
}

/** Valor breve de asistencia pedagógica para mostrar debajo de su rótulo. */
export function valorApoyoMapa(clases: EstadoClases, apoyo: ApoyoPedagogico): string | null {
  if (clases === 'normal' || apoyo === null) return null
  return TEXTO_APOYO[apoyo].valor
}
