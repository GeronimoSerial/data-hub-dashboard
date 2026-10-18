// Quiet basemap for the infrastructure map: the OpenFreeMap styles carry POIs,
// road shields and black place dots (`circle_11_black`) that compete with the
// school and station symbols. Hide that noise and keep only town names, softer.

import { realzarRutasYAgua, type CapaBasemap } from './basemap-rutas-agua'

type CapaEstilo = CapaBasemap & { layout?: Record<string, unknown> }

export type MapaEstilo = {
  getStyle(): { layers?: CapaEstilo[] } | undefined
  setLayoutProperty(id: string, propiedad: string, valor: unknown): void
  setPaintProperty(id: string, propiedad: string, valor: unknown): void
}

const CAPAS_OCULTAS = /^(poi_|airport|highway-shield|road_shield|road_one|road_oneway|label_village|label_other|highway-name-)/
const ETIQUETAS_LOCALIDAD = /^label_(town|city|city_capital|state)$/

/** Applies the quiet treatment. Idempotent; call again after every style load. */
export function aquietarBasemap(mapa: Partial<MapaEstilo>): void {
  if (typeof mapa.getStyle !== 'function' || typeof mapa.setLayoutProperty !== 'function' || typeof mapa.setPaintProperty !== 'function') return
  const capas = mapa.getStyle()?.layers ?? []
  const setLayout = mapa.setLayoutProperty.bind(mapa)
  const setPaint = mapa.setPaintProperty.bind(mapa)
  realzarRutasYAgua({ setLayoutProperty: setLayout, setPaintProperty: setPaint }, capas)
  for (const capa of capas) {
    if (capa.type !== 'symbol') continue
    try {
      if (CAPAS_OCULTAS.test(capa.id)) {
        setLayout(capa.id, 'visibility', 'none')
      } else if (ETIQUETAS_LOCALIDAD.test(capa.id)) {
        if (capa.layout?.['icon-image'] !== undefined) setLayout(capa.id, 'icon-image', undefined)
        setLayout(capa.id, 'text-anchor', 'center')
        setLayout(capa.id, 'text-offset', [0, 0])
        setPaint(capa.id, 'text-opacity', 0.7)
      }
    } catch {
      // A style without the property is fine: keep the remaining layers.
    }
  }
}
