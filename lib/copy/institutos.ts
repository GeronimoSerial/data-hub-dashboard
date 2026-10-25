// Textos del parte para institutos superiores. Los textos de escuela viven en
// sus componentes y no cambian: cada punto de uso elige con `esInstituto`.
import type { CategoriaAfectacion } from '@/lib/infraestructura/categorias'
import type { Severidad } from '@/lib/infraestructura/validacion'

export const DESCRIPCION_CATEGORIA_INSTITUTO: Record<CategoriaAfectacion, string> = {
  establecimiento: 'El instituto o parte de él deja de funcionar con normalidad.',
  alumnos: 'El instituto funciona, pero hay alumnos que no pueden llegar.',
}

export const CONFIRMAR_CATEGORIA_INSTITUTO: Record<CategoriaAfectacion, string> = {
  establecimiento:
    'Va a marcar las carreras donde el instituto no puede funcionar con normalidad. Si son alumnos puntuales que no pueden llegar, elija "Inaccesibilidad de alumnos".',
  alumnos:
    'Va a marcar sólo a los alumnos que no pueden llegar al instituto. Si la situación afecta al edificio o al instituto, elija "Afecta al establecimiento".',
}

export const CRITERIO_SEVERIDAD_INSTITUTO: Record<CategoriaAfectacion, Record<Severidad, string>> = {
  establecimiento: {
    Baja: 'Molesta, pero se dicta clase normalmente.',
    Media: 'Condiciona el dictado: algunas carreras funcionan a medias.',
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

export const MENSAJE_GUARDADO_INSTITUTO = 'Ya figura en el estado actual de su institución.'
