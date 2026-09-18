// Catálogo fijo de categorías de problemática. A propósito no es una tabla:
// son exactamente dos naturalezas de problema (ver spec de diseño), y
// `permiteAlumnos` es la ÚNICA fuente de verdad sobre si una categoría admite
// selección nominal de alumnos. Ni el formulario ni el POST deciden esto por
// su cuenta, siempre consultan este mapa.
export const CATEGORIAS = ['establecimiento', 'alumnos'] as const

export type CategoriaProblematica = (typeof CATEGORIAS)[number]

export const CATEGORIA_META: Record<
  CategoriaProblematica,
  { label: string; descripcion: string; permiteAlumnos: boolean }
> = {
  establecimiento: {
    label: 'Afecta al establecimiento',
    descripcion: 'La escuela o parte de ella queda fuera de servicio.',
    permiteAlumnos: false,
  },
  alumnos: {
    label: 'Inaccesibilidad de alumnos',
    descripcion: 'La escuela funciona, pero hay alumnos que no pueden llegar.',
    permiteAlumnos: true,
  },
}

export function esCategoria(v: string): v is CategoriaProblematica {
  return (CATEGORIAS as readonly string[]).includes(v)
}
