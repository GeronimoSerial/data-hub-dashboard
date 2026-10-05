import type { EstadoClases, GravedadMapa } from '@/lib/infraestructura/mapa/tipos'

export const ETIQUETA_GRAVEDAD: Record<GravedadMapa, string> = {
  4: 'Crítica',
  3: 'Alta',
  2: 'Media',
  1: 'Baja',
  0: 'Sin reporte',
}

export const ETIQUETA_CLASES: Record<EstadoClases, string> = {
  normal: 'Con clases',
  parcial: 'Clases parciales',
  sin: 'Sin clases',
  evacuado: 'Evacuado',
  centro: 'Centro de evacuados',
}

export const ETIQUETA_APOYO: Record<'brinda' | 'no' | 'virtual' | 'cuadernillo', string> = {
  brinda: 'Brinda',
  no: 'No brinda',
  virtual: 'Clase virtual',
  cuadernillo: 'Cuadernillo',
}
