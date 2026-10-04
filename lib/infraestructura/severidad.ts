import type { Severidad } from './validacion'
import type { CategoriaAfectacion } from './categorias'
import { PALETA_TONAL_SEVERIDAD } from '@/lib/mapas/paleta-tonal'

// Escala tonal de una sola gama para la severidad (claro→oscuro, rojo). Única
// fuente para el mapa, la lista y la ficha: no se redefinen por componente.
// Los hex viven en lib/mapas/paleta-tonal.ts (fuente de verdad compartida).
export const SEVERIDAD_COLORES: Record<Severidad, string> = { ...PALETA_TONAL_SEVERIDAD }

export const SEVERIDAD_COLOR_DEFECTO = PALETA_TONAL_SEVERIDAD.Baja

/*
  Qué distingue un nivel del siguiente, en la lengua del director.

  La especificación funcional define que la severidad es por afectación
  (§ "Severidad") pero NO define los criterios: sin esto, "Alta" y "Crítica"
  quedaban a interpretación de cada director y el dato dejaba de ser
  comparable entre escuelas. Estos cuatro criterios fueron acordados con el
  dueño de producto el 2026-09-21.

  Los criterios de alumnos se acordaron el 2026-10-04.

  El eje es el dictado de clase, que es lo que el director puede observar sin
  tener que estimar daños ni riesgos que no le competen.
*/
export const SEVERIDAD_CRITERIOS_POR_CATEGORIA: Record<
  CategoriaAfectacion,
  Record<Severidad, string>
> = {
  establecimiento: {
    Baja: 'Molesta, pero se dicta clase normalmente.',
    Media: 'Condiciona el dictado: algunas secciones o turnos funcionan a medias.',
    Alta: 'Impide dictar clase en parte del establecimiento.',
    Crítica: 'Impide el funcionamiento o hay riesgo para las personas.',
  },
  alumnos: {
    Baja: 'Llegan con demora o dificultad, pero asisten.',
    Media: 'Algunos alumnos faltan algunos días por el acceso.',
    Alta: 'Los alumnos afectados no pueden llegar de forma sostenida.',
    Crítica: 'Llegar implica riesgo para los alumnos (cruzar un arroyo crecido, un camino anegado).',
  },
}

export const SEVERIDAD_CRITERIOS = SEVERIDAD_CRITERIOS_POR_CATEGORIA.establecimiento

export function criterioSeveridad(
  severidad: string,
  categoria: CategoriaAfectacion = 'establecimiento',
): string | null {
  return SEVERIDAD_CRITERIOS_POR_CATEGORIA[categoria][severidad as Severidad] ?? null
}

export function colorSeveridad(severidad: string): string {
  return (
    SEVERIDAD_COLORES[severidad as Severidad] ?? SEVERIDAD_COLOR_DEFECTO
  )
}
