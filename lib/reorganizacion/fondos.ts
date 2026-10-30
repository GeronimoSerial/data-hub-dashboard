// Fondos de mapa base disponibles para el mapa de reorganización. Solo usa
// los ids ya definidos en BASEMAPS: los fondos pendientes se listan aparte y
// no tienen controles ni URL de estilo.

import { BASEMAPS, type BasemapId } from '@/lib/map-types'

export type FondoReorganizacion = {
  id: BasemapId
  etiqueta: string
  descripcion: string
}

export type FondoPendiente = {
  id: 'topografico' | 'satelital'
  motivo: string
}

// Mismo fondo que usa natalidad (`BASEMAPS.voyager`).
export const FONDO_POR_DEFECTO: BasemapId = 'voyager'

const DESCRIPCIONES: Record<BasemapId, string> = {
  osm: 'Calles, caminos y rutas.',
  voyager: 'Estilo vial alternativo.',
  positron: 'Estilo claro y sobrio.',
}

export const FONDOS_REORGANIZACION: readonly FondoReorganizacion[] = (
  Object.keys(BASEMAPS) as BasemapId[]
).map((id) => ({
  id,
  etiqueta: BASEMAPS[id].label,
  descripcion: DESCRIPCIONES[id],
}))

// Solo documentación y panel metodológico. No se renderizan como controles
// hasta que exista proveedor, licencia y atribución confirmados.
export const FONDOS_PENDIENTES: readonly FondoPendiente[] = [
  { id: 'topografico', motivo: 'Servicio topográfico por definir.' },
  { id: 'satelital', motivo: 'Proveedor, licencia y atribución por confirmar' },
]

/** URL de estilo del fondo; un id no disponible cae al fondo por defecto. */
export function estiloDeFondo(id: string): string {
  const fondo = FONDOS_REORGANIZACION.find((item) => item.id === id)
  return BASEMAPS[fondo?.id ?? FONDO_POR_DEFECTO].styleUrl
}
