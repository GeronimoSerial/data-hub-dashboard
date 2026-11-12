import type { MapGeoJSONFeature, Map as MapaMaplibre } from 'maplibre-gl'
import type { CapasVisibles } from '@/lib/infraestructura/mapa/capas'

// Gancho de prueba E2E (plan 4.5). Solo se instala cuando el build corre con
// NEXT_PUBLIC_E2E=true; Next reemplaza esa expresión en el build, así que en
// producción el cuerpo queda sin alcanzar.

export type GanchoMapaE2E = {
  /** Claves de CapasVisibles cuyas capas MapLibre existen y no están ocultas. */
  capasVisibles(): Array<keyof CapasVisibles>
  /** Features dibujadas (queryRenderedFeatures) de la capa indicada. Clave desconocida: error. */
  featuresRenderizadas(capa: string): number
  /** Coordenada de página (píxeles CSS del viewport) de un lon/lat, para clics con Playwright. */
  proyectar(lon: number, lat: number): { x: number; y: number }
  /** Zoom actual del mapa MapLibre. */
  zoom(): number
}

declare global {
  interface Window {
    __mapaE2E?: GanchoMapaE2E
  }
}

// Ids de capa declarados en map-infraestructura-page.tsx y en los componentes
// de capa que usa. Si cambian ahí, la prueba e2e de conteo falla con 0.
const CAPAS_MAPLIBRE: Record<keyof CapasVisibles, readonly string[]> = {
  estacionesRio: ['estaciones-rio-simbolos'],
  lluviaObservada: ['lluvia-observada-hit'],
  limitesDepartamentos: ['infra-departamentos-borde'],
  nombresDepartamentos: ['infra-departamentos-etiqueta'],
  rutaAcceso: ['infra-ruta-acceso-line'],
  crucesAgua: ['infra-cruces-acceso-symbol'],
  // Esta clave enciende la capa de riesgo de situación sobre las escuelas.
  escuelasAisladas: ['infra-riesgo-situacion'],
  escuelasEnRiesgo: ['infra-riesgo-hoy'],
}

// Propiedades que identifican una feature de forma estable. Las teselas recortan un
// mismo elemento en copias con las mismas propiedades, así que la clave sale de ellas.
const CAMPOS_IDENTIDAD = ['id', 'estacionId', 'geometryRef', 'cue', 'cueAnexo'] as const

function claveFeature(feature: MapGeoJSONFeature): string {
  if (feature.id !== undefined && feature.id !== null) return `id:${String(feature.id)}`
  const propiedades: Record<string, unknown> = feature.properties ?? {}
  for (const campo of CAMPOS_IDENTIDAD) {
    const valor = propiedades[campo]
    if (valor !== undefined && valor !== null && valor !== '') return `${campo}:${String(valor)}`
  }
  return `propiedades:${JSON.stringify(propiedades)}`
}

function capaVisible(map: MapaMaplibre, id: string): boolean {
  return Boolean(map.getLayer(id)) && map.getLayoutProperty(id, 'visibility') !== 'none'
}

export function instalarGanchoE2E(map: MapaMaplibre): void {
  if (process.env.NEXT_PUBLIC_E2E !== 'true') return
  if (typeof window === 'undefined') return

  window.__mapaE2E = {
    capasVisibles: () =>
      (Object.keys(CAPAS_MAPLIBRE) as Array<keyof CapasVisibles>)
        .filter((clave) => CAPAS_MAPLIBRE[clave].every((id) => capaVisible(map, id))),

    featuresRenderizadas: (capa) => {
      const ids = CAPAS_MAPLIBRE[capa as keyof CapasVisibles]
      if (!ids) throw new Error(`Capa desconocida para el gancho E2E: ${capa}`)
      // Cuenta features únicas: queryRenderedFeatures repite las que cruzan un borde de tesela.
      const claves = new Set<string>()
      for (const id of ids) {
        if (!map.getLayer(id)) continue
        for (const feature of map.queryRenderedFeatures(undefined, { layers: [id] })) claves.add(claveFeature(feature))
      }
      return claves.size
    },

    proyectar: (lon, lat) => {
      const punto = map.project([lon, lat])
      const caja = map.getCanvas().getBoundingClientRect()
      return { x: caja.left + punto.x, y: caja.top + punto.y }
    },

    zoom: () => map.getZoom(),
  }
}
