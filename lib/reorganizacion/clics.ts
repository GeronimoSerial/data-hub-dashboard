// Resolución de clics sobre las capas del mapa de reorganización. Pura: recibe
// las features que devuelve MapLibre y elige una sola según la prioridad.

import {
  CAPA_OTRAS_PRIMARIAS,
  CAPA_SECUNDARIAS,
  CAPA_UNIVERSO,
  CAPA_ZONAS,
} from './capas'

export interface CaracteristicaClic {
  layer: string
  properties: Record<string, unknown>
}

export interface CapasVisiblesClic {
  zonas: boolean
  otrasPrimarias: boolean
  secundarias: boolean
}

export type ResultadoClic =
  | { tipo: 'escuela'; cue: string }
  | { tipo: 'referencia'; cue: string; nivel: 'primaria' | 'secundaria' }
  | { tipo: 'zona'; id: number }
  | null

/**
 * Capas interactivas de mayor a menor prioridad. Secundarias va antes que
 * otras primarias porque se dibuja encima: un establecimiento que es ambos
 * niveles responde como lo que se ve.
 */
export const CAPAS_INTERACTIVAS: readonly string[] = [
  CAPA_UNIVERSO,
  CAPA_SECUNDARIAS,
  CAPA_OTRAS_PRIMARIAS,
  CAPA_ZONAS,
]

const NIVEL_POR_CAPA: Record<string, 'primaria' | 'secundaria'> = {
  [CAPA_OTRAS_PRIMARIAS]: 'primaria',
  [CAPA_SECUNDARIAS]: 'secundaria',
}

/** Escuela del universo > referencia primaria/secundaria > zona. Lo demás no responde. */
export function resolverClic(features: CaracteristicaClic[]): ResultadoClic {
  for (const capa of CAPAS_INTERACTIVAS) {
    for (const feature of features) {
      if (feature.layer !== capa) continue
      const { cue, id } = feature.properties

      if (capa === CAPA_UNIVERSO && typeof cue === 'string') {
        return { tipo: 'escuela', cue }
      }
      if (capa in NIVEL_POR_CAPA && typeof cue === 'string') {
        return { tipo: 'referencia', cue, nivel: NIVEL_POR_CAPA[capa] }
      }
      if (capa === CAPA_ZONAS && typeof id === 'number' && Number.isFinite(id)) {
        return { tipo: 'zona', id }
      }
    }
  }
  return null
}

/** Ids de capas interactivas visibles, en orden de prioridad. El universo siempre está visible. */
export function idsInteractivos(visibles: CapasVisiblesClic): string[] {
  const ids: string[] = [CAPA_UNIVERSO]
  if (visibles.secundarias) ids.push(CAPA_SECUNDARIAS)
  if (visibles.otrasPrimarias) ids.push(CAPA_OTRAS_PRIMARIAS)
  if (visibles.zonas) ids.push(CAPA_ZONAS)
  return ids
}
