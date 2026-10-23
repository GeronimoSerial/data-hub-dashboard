import type { CategoriaAfectacion } from './categorias'

// Spec rediseño §3.2: avisos no bloqueantes para elecciones posibles pero
// sospechosas. Una regla nueva se agrega acá, con su test, y la UI la muestra
// sin cambios porque sólo recorre la lista.
export type AccionRedSeguridad = 'marcar-toda-la-escuela'

export interface AvisoRedSeguridad {
  id: 'todas-las-secciones'
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

export function evaluarRedesSeguridad(e: EntradaRedSeguridad): AvisoRedSeguridad[] {
  const avisos: AvisoRedSeguridad[] = []
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
