import type { CategoriaAfectacion } from './categorias'

// Spec rediseño §3.2: avisos no bloqueantes para elecciones posibles pero
// sospechosas. Una regla nueva se agrega acá, con su test, y la UI la muestra
// sin cambios porque sólo recorre la lista.
export type AccionRedSeguridad = 'cambiar-a-establecimiento' | 'marcar-toda-la-escuela'

export interface AvisoRedSeguridad {
  id: 'mayoria-alumnos' | 'todas-las-secciones'
  mensaje: string
  accion: { etiqueta: string; tipo: AccionRedSeguridad }
}

export interface EntradaRedSeguridad {
  categoria: CategoriaAfectacion | ''
  alumnosMarcados: number
  matricula: number
  seccionesMarcadas: number
  seccionesTotales: number
  alcanceEstablecimiento: '' | 'toda' | 'algunas'
}

export const UMBRAL_MAYORIA_ALUMNOS = 0.5

export function evaluarRedesSeguridad(e: EntradaRedSeguridad): AvisoRedSeguridad[] {
  const avisos: AvisoRedSeguridad[] = []
  if (e.categoria === 'alumnos' && e.matricula > 0 && e.alumnosMarcados / e.matricula > UMBRAL_MAYORIA_ALUMNOS) {
    avisos.push({
      id: 'mayoria-alumnos',
      mensaje: 'Marcó a la mayoría de los alumnos. ¿No será un problema del establecimiento?',
      accion: { etiqueta: 'Cambiar a establecimiento', tipo: 'cambiar-a-establecimiento' },
    })
  }
  if (
    e.categoria === 'establecimiento' &&
    e.alcanceEstablecimiento === 'algunas' &&
    e.seccionesTotales > 0 &&
    e.seccionesMarcadas === e.seccionesTotales
  ) {
    avisos.push({
      id: 'todas-las-secciones',
      mensaje: 'Marcó todas las secciones. ¿Es toda la escuela?',
      accion: { etiqueta: 'Sí, toda la escuela', tipo: 'marcar-toda-la-escuela' },
    })
  }
  return avisos
}
