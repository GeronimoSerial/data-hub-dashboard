import { es } from '@/lib/i18n/diccionarios/es'
import type { Diccionario } from '@/lib/i18n/diccionarios/tipos'
import type { ApoyoPedagogico, EstadoClases } from './tipos'

const TEXTO_APOYO = {
  sin_dato: { valor: 'Sin dato' },
  no: { valor: 'No se brinda' },
  brinda: { valor: 'Se brinda' },
  virtual: { valor: 'Se brinda (virtual)' },
  cuadernillo: { valor: 'Se brinda (cuadernillo)' },
  ambos: { valor: 'Se brinda (virtual y cuadernillo)' },
} satisfies Record<Exclude<ApoyoPedagogico, null>, { valor: string }>

/** Comparte la etiqueta de asistencia pedagógica entre la lista y la ficha de la escuela. Sin `t`, en español. */
export function etiquetaApoyoMapa(clases: EstadoClases, apoyo: ApoyoPedagogico, t: Diccionario = es): string | null {
  if (clases === 'normal' || apoyo === null) return null
  return t.etiquetas.apoyoEtiqueta[apoyo]
}

/** Valor breve de asistencia pedagógica para mostrar debajo de su rótulo. */
export function valorApoyoMapa(clases: EstadoClases, apoyo: ApoyoPedagogico): string | null {
  if (clases === 'normal' || apoyo === null) return null
  return TEXTO_APOYO[apoyo].valor
}
