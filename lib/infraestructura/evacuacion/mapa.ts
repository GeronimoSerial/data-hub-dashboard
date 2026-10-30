import type { CentroEvacuadosRespuesta } from './respuesta'

export const COLOR_POSIBLE_CENTRO = '#15803d'
export const ETIQUETA_POSIBLE_CENTRO = 'Posible centro de evacuados'
export const ETIQUETA_POSIBLE_CENTRO_SIN_ANTECEDENTES = 'Posible centro de evacuados (sin antecedentes de riesgo)'

// Mismo anillo que dibuja la capa del mapa (trazo verde, sin relleno), a tamaño de leyenda.
export const SVG_ANILLO_POSIBLE_CENTRO =
  `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5" fill="none" stroke="${COLOR_POSIBLE_CENTRO}" stroke-width="2.5"/></svg>`

interface EscuelaConMarca {
  cueAnexo: string
  nombre: string
  lat: number | null
  lon: number | null
  posibleCentroEvacuados?: boolean
}

export function construirPuntosPosiblesCentros(
  escuelas: readonly EscuelaConMarca[],
): GeoJSON.FeatureCollection<GeoJSON.Point, { cueAnexo: string; nombre: string }> {
  return {
    type: 'FeatureCollection',
    features: escuelas.flatMap((e) =>
      e.posibleCentroEvacuados === true && e.lat !== null && e.lon !== null
        ? [{
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [e.lon, e.lat] },
          properties: { cueAnexo: e.cueAnexo, nombre: e.nombre },
        }]
        : [],
    ),
  }
}

export interface CaminoCentro {
  linea: GeoJSON.FeatureCollection<GeoJSON.LineString, { tipo: 'camino' | 'linea_recta' }>
  destino: GeoJSON.FeatureCollection<GeoJSON.Point, { nombre: string }>
}

// Con ruta OSM se dibuja ESA ruta (copia exacta de las coordenadas); sin ella,
// una línea recta origen-destino con `tipo: 'linea_recta'` para estilarla distinta.
export function construirCaminoCentro(
  respuesta: CentroEvacuadosRespuesta | null,
  origen: { lat: number; lon: number } | null,
): CaminoCentro | null {
  if (!respuesta?.disponible || !respuesta.destino || !respuesta.tipo) return null
  const { destino } = respuesta
  let coordinates: Array<[number, number]>
  if (respuesta.tipo === 'camino' && respuesta.ruta) coordinates = respuesta.ruta.coordinates
  else if (origen) coordinates = [[origen.lon, origen.lat], [destino.lon, destino.lat]]
  else return null
  const tipo = respuesta.tipo === 'camino' && respuesta.ruta ? 'camino' : 'linea_recta'
  return {
    linea: { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates }, properties: { tipo } }] },
    destino: { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [destino.lon, destino.lat] }, properties: { nombre: destino.nombre } }] },
  }
}

const FORMATO_KM = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

export function etiquetaDistanciaCentro(respuesta: CentroEvacuadosRespuesta): string | null {
  if (respuesta.distanciaKm === undefined) return null
  const km = FORMATO_KM.format(respuesta.distanciaKm)
  return respuesta.tipo === 'camino' ? `${km} km por camino` : `${km} km en línea recta (sin camino calculado)`
}
