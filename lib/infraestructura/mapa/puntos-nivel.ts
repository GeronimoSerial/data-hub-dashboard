import type { FeatureCollection, Point } from 'geojson'
import type { TerritorioMapa } from '@/lib/infraestructura/territorio-mapa'
import { coloresPlanificacion } from './planificacion'
import type { EscuelaMapaEnriquecida } from './tipos'

export interface PropiedadesPuntoNivel {
  cueAnexo: string
  color?: string
  conDato: boolean
  juntoLaguna: boolean
  /** Radar: 3 muy alto, 2 alto, 1 moderado; define el tamaño. */
  peso?: number
}

export function construirPuntosNivel(
  escuelas: ReadonlyArray<{ cueAnexo: string; lat: number | null; lon: number | null }>,
  colorPorCue: ReadonlyMap<string, string>,
  juntoLagunaPorCue: ReadonlySet<string> = new Set(),
): FeatureCollection<Point, PropiedadesPuntoNivel> {
  return {
    type: 'FeatureCollection',
    features: escuelas.flatMap((escuela) => {
      if (escuela.lat === null || escuela.lon === null) return []
      const color = colorPorCue.get(escuela.cueAnexo)
      return [{
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [escuela.lon, escuela.lat] },
        properties: {
          cueAnexo: escuela.cueAnexo,
          ...(color !== undefined ? { color } : {}),
          conDato: color !== undefined,
          juntoLaguna: juntoLagunaPorCue.has(escuela.cueAnexo),
        },
      }]
    }),
  }
}

/** Sólo los puntos con nivel territorial (sin nivel o sin dato quedan fuera). */
export function soloConDato(
  puntos: FeatureCollection<Point, PropiedadesPuntoNivel>,
): FeatureCollection<Point, PropiedadesPuntoNivel> {
  return { ...puntos, features: puntos.features.filter(({ properties }) => properties.conDato) }
}

/** Exposición a inundación: nivel territorial o junto a laguna (sin dato y sin laguna quedan fuera). */
export function soloConDatoOJuntoLaguna(
  puntos: FeatureCollection<Point, PropiedadesPuntoNivel>,
): FeatureCollection<Point, PropiedadesPuntoNivel> {
  return {
    ...puntos,
    features: puntos.features.filter(({ properties }) => properties.conDato || properties.juntoLaguna),
  }
}

export function puntosRiesgoSobreSituacion(
  escuelas: EscuelaMapaEnriquecida[],
  territorio: TerritorioMapa | null,
): FeatureCollection<Point, PropiedadesPuntoNivel> {
  return soloConDato(construirPuntosNivel(escuelas, coloresPlanificacion(escuelas, 'aisladas', { territorio })))
}

const PESO_RIESGO: Record<string, number> = { muy_alto: 3, alto: 2, moderado: 1 }

/**
 * Radar ("Riesgo actual (hoy)"): sólo se dibujan las escuelas con riesgo
 * moderado o más, con tamaño por nivel. Riesgo bajo y sin dato no se dibujan
 * (las listas y los KPI conservan sus cuentas).
 */
export function puntosRadarVisibles(
  puntos: FeatureCollection<Point, PropiedadesPuntoNivel>,
  nivelPorCue: ReadonlyMap<string, string>,
): FeatureCollection<Point, PropiedadesPuntoNivel> {
  return {
    ...puntos,
    features: puntos.features.flatMap((feature) => {
      const peso = PESO_RIESGO[nivelPorCue.get(feature.properties.cueAnexo) ?? '']
      return peso === undefined ? [] : [{ ...feature, properties: { ...feature.properties, peso } }]
    }),
  }
}
