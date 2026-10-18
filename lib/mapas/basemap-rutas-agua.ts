// Road hierarchy and waterways on the OpenFreeMap basemap. Layer ids differ
// between liberty/bright/positron/dark, so layers are matched by their
// OpenMapTiles `source-layer` and the classes their filter mentions.

export type CapaBasemap = {
  id: string
  type: string
  'source-layer'?: string
  filter?: unknown
}

export type MapaPintable = {
  setPaintProperty(id: string, propiedad: string, valor: unknown): void
  setLayoutProperty(id: string, propiedad: string, valor: unknown): void
}

export const COLOR_TIERRA = '#b08a5a'
export const COLOR_AGUA_LINEA = '#7f97a8'
const COLOR_MENOR = '#c9c9c4'

const CLASES_PRINCIPALES = new Set(['motorway', 'trunk', 'primary', 'secondary'])
const CLASES_TIERRA = new Set(['track', 'unclassified'])
const CLASES_MENORES = new Set(['minor', 'service', 'street', 'street_limited', 'residential'])

export type JerarquiaRuta = 'principal' | 'tierra' | 'menor' | null

/** String literals mentioned anywhere in a style filter expression. */
export function literalesFiltro(filtro: unknown): Set<string> {
  const salida = new Set<string>()
  const visitar = (nodo: unknown) => {
    if (typeof nodo === 'string') salida.add(nodo)
    else if (Array.isArray(nodo)) nodo.forEach(visitar)
  }
  visitar(filtro)
  return salida
}

/** Classifies a `transportation` line layer by the road classes its filter targets. */
export function jerarquiaRuta(capa: CapaBasemap): JerarquiaRuta {
  if (capa.type !== 'line' || capa['source-layer'] !== 'transportation') return null
  const literales = literalesFiltro(capa.filter)
  // Ramp layers mix every class; leave them as the style draws them.
  if (literales.has('ramp')) return null
  const menciona = (clases: Set<string>) => [...clases].some((c) => literales.has(c))
  if (menciona(CLASES_TIERRA)) return 'tierra'
  if (menciona(CLASES_PRINCIPALES)) return 'principal'
  if (menciona(CLASES_MENORES)) return 'menor'
  return null
}

const esCasing = (id: string) => /casing/.test(id)

/** Paint changes for one basemap layer; empty when the layer is not ours to touch. */
export function ajustesCapa(capa: CapaBasemap): Array<['paint' | 'layout', string, unknown]> {
  if (capa.type === 'line' && capa['source-layer'] === 'waterway') {
    return [
      ['paint', 'line-color', COLOR_AGUA_LINEA],
      ['paint', 'line-dasharray', ['case', ['==', ['get', 'intermittent'], 1], ['literal', [3, 2]], ['literal', [1, 0]]]],
    ]
  }
  if (capa.type === 'symbol' && capa['source-layer'] === 'waterway') {
    return [['layout', 'text-font', ['literal', ['Noto Sans Italic']]]]
  }
  switch (jerarquiaRuta(capa)) {
    case 'principal':
      return [['paint', 'line-opacity', 1]]
    case 'tierra':
      if (esCasing(capa.id)) return [['paint', 'line-opacity', 0.35]]
      return [
        ['paint', 'line-color', ['match', ['get', 'class'], ['track', 'unclassified'], COLOR_TIERRA, COLOR_MENOR]],
        ['paint', 'line-opacity', ['match', ['get', 'class'], ['track', 'unclassified'], 0.9, 0.55]],
      ]
    case 'menor':
      return [['paint', 'line-opacity', esCasing(capa.id) ? 0.35 : 0.55]]
    default:
      return []
  }
}

/** Applies road hierarchy and waterway styling. Idempotent; call after every style load. */
export function realzarRutasYAgua(mapa: MapaPintable, capas: CapaBasemap[]): void {
  for (const capa of capas) {
    for (const [tipo, propiedad, valor] of ajustesCapa(capa)) {
      try {
        if (tipo === 'paint') mapa.setPaintProperty(capa.id, propiedad, valor)
        else mapa.setLayoutProperty(capa.id, propiedad, valor)
      } catch {
        // A style that rejects the property keeps its own look for that layer.
      }
    }
  }
}
