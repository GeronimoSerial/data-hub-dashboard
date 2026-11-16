import type { CentroEvacuadosRespuesta } from './respuesta'
import { es } from '@/lib/i18n/diccionarios/es'
import type { Diccionario } from '@/lib/i18n/diccionarios/tipos'

export const COLOR_POSIBLE_CENTRO = '#15803d'
export const ETIQUETA_POSIBLE_CENTRO = 'Posible centro de evacuados'
export const ETIQUETA_POSIBLE_CENTRO_SIN_ANTECEDENTES = 'Posible centro de evacuados (sin antecedentes de riesgo)'

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

export function etiquetaDistanciaCentro(respuesta: CentroEvacuadosRespuesta, t: Diccionario = es): string | null {
  if (respuesta.distanciaKm === undefined) return null
  const km = FORMATO_KM.format(respuesta.distanciaKm)
  const textos = t.libTextos.distanciaCentro
  return respuesta.tipo === 'camino' ? textos.porCamino(km) : textos.enLineaRecta(km)
}
