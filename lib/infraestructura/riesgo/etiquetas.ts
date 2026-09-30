// Sólo presentación: la API y el valor interno siguen usando el enum crudo.
//
// Movido desde `app/(hub)/admin/riesgo/etiquetas.ts` (E3b) a esta ubicación
// compartida: el follow-up 4 del Gate de E4 necesita el mismo mapa de
// etiquetas para el panel de explicación del Radar
// (`components/mapas/risk-explanation-panel.tsx`), que vive fuera de
// `app/(hub)/admin`. El contenido no cambió, sólo la ruta; los dos
// consumidores de `/admin/riesgo` se actualizaron para importar desde acá.
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
