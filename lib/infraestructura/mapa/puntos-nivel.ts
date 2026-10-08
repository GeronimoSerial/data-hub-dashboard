import type { FeatureCollection, Point } from 'geojson'
import type { TerritorioMapa } from '@/lib/infraestructura/territorio-mapa'
import { coloresPlanificacion } from './planificacion'
import type { EscuelaMapaEnriquecida } from './tipos'

export interface PropiedadesPuntoNivel {
  cueAnexo: string
  color?: string
  conDato: boolean
  juntoLaguna: boolean
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
