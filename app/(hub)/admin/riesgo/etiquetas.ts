// Sólo presentación: la API y el valor interno siguen usando el enum crudo.
export const ETIQUETA_NIVEL: Record<string, string> = {
  bajo: 'Bajo',
  moderado: 'Moderado',
  alto: 'Alto',
  muy_alto: 'Muy alto',
}

export const ETIQUETA_CONFIANZA: Record<string, string> = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
}

export const ETIQUETA_TIPO_FACTOR: Record<string, string> = {
  amenaza: 'Amenaza',
  vulnerabilidad: 'Vulnerabilidad',
  exposicion: 'Exposición',
  urgencia: 'Urgencia',
}

export function etiqueta(mapa: Record<string, string>, valor: string | null): string {
  if (valor === null) return '—'
  return mapa[valor] ?? valor
}
