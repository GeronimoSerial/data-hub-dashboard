// Fondos de mapa base disponibles para el mapa de reorganización. Solo usa
// los ids ya definidos en BASEMAPS: los fondos pendientes se listan aparte y
// no tienen controles ni URL de estilo.

import type { StyleSpecification } from 'maplibre-gl'
import { BASEMAPS, type BasemapId } from '@/lib/map-types'

/** Fondos de este mapa: los de BASEMAPS más la vista satelital, que solo usa este mapa. */
export type FondoId = BasemapId | 'satelital'

export type FondoReorganizacion = {
  id: FondoId
  etiqueta: string
  descripcion: string
}

export type FondoPendiente = {
  id: 'topografico'
  motivo: string
}

// Mismo fondo que usa natalidad (`BASEMAPS.voyager`).
export const FONDO_POR_DEFECTO: FondoId = 'voyager'

const DESCRIPCIONES: Record<FondoId, string> = {
  osm: 'Calles, caminos y rutas.',
  voyager: 'Estilo vial alternativo.',
  positron: 'Estilo claro y sobrio.',
  satelital: 'Imágenes satelitales con nombres de lugares.',
}

const ATRIBUCION_SATELITAL =
  'Imágenes © Esri, Maxar, Earthstar Geographics y la comunidad de usuarios de GIS'

/**
 * Esri World Imagery (sin clave de API) con la capa de referencia de límites y
 * lugares encima. Los tiles llegan hasta el nivel 19; más cerca, MapLibre amplía.
 */
export const ESTILO_SATELITAL: StyleSpecification = {
  version: 8,
  sources: {
    'esri-imagenes': {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 19,
      attribution: ATRIBUCION_SATELITAL,
    },
    'esri-lugares': {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      maxzoom: 19,
    },
  },
  layers: [
    { id: 'esri-imagenes', type: 'raster', source: 'esri-imagenes' },
    { id: 'esri-lugares', type: 'raster', source: 'esri-lugares' },
  ],
}

export const FONDOS_REORGANIZACION: readonly FondoReorganizacion[] = [
  ...(Object.keys(BASEMAPS) as BasemapId[]).map((id) => ({
    id,
    etiqueta: BASEMAPS[id].label,
    descripcion: DESCRIPCIONES[id],
  })),
  { id: 'satelital', etiqueta: 'Satélite', descripcion: DESCRIPCIONES.satelital },
]

// Solo documentación y panel metodológico. No se renderizan como controles
// hasta que exista proveedor, licencia y atribución confirmados.
export const FONDOS_PENDIENTES: readonly FondoPendiente[] = [
  { id: 'topografico', motivo: 'Servicio topográfico por definir.' },
]

/** URL de estilo del fondo; un id no disponible cae al fondo por defecto. */
export function estiloDeFondo(id: string): string | StyleSpecification {
  const elegido = FONDOS_REORGANIZACION.find((item) => item.id === id)?.id ?? FONDO_POR_DEFECTO
  return elegido === 'satelital' ? ESTILO_SATELITAL : BASEMAPS[elegido].styleUrl
}
