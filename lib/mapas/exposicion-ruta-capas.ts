import type { ExposicionRutaRespuesta } from '@/lib/infraestructura/exposicion-ruta'

export const CAPA_CELDAS_EXPOSICION_ID = 'infra-celdas-exposicion-fill'
export const COLOR_CELDAS_EXPOSICION = '#d9903d'
export const OPACIDAD_CELDAS_EXPOSICION = 0.35

export function construirCeldasExposicion(
  exposicion: ExposicionRutaRespuesta | null,
): GeoJSON.FeatureCollection<GeoJSON.Polygon> | null {
  if (
    exposicion === null ||
    !exposicion.disponible ||
    exposicion.resolucionArcsec === null ||
    !Number.isFinite(exposicion.resolucionArcsec) ||
    exposicion.resolucionArcsec <= 0
  ) return null

  const mitad = exposicion.resolucionArcsec / 3600 / 2
  const features: GeoJSON.Feature<GeoJSON.Polygon>[] = []
  for (const celda of exposicion.celdasAfectadas) {
    if (
      !Number.isFinite(celda.lon) ||
      !Number.isFinite(celda.lat) ||
      celda.profundidadM === null ||
      !Number.isFinite(celda.profundidadM) ||
      celda.profundidadM <= 0
    ) continue
    const oeste = celda.lon - mitad
    const este = celda.lon + mitad
    const sur = celda.lat - mitad
    const norte = celda.lat + mitad
    features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [[[oeste, sur], [este, sur], [este, norte], [oeste, norte], [oeste, sur]]] },
      properties: { profundidadM: celda.profundidadM },
    })
  }
  return features.length === 0 ? null : { type: 'FeatureCollection', features }
}
