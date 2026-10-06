import type { FeatureCollection, Point } from 'geojson'
import type { TerritorioMapa } from '@/lib/infraestructura/territorio-mapa'
import { coloresPlanificacion, type VistaPlanificacion } from './planificacion'
import type { EscuelaMapaEnriquecida } from './tipos'

export interface PropiedadesPuntoNivel {
  cueAnexo: string
  color?: string
  conDato: boolean
}

export function construirPuntosNivel(
  escuelas: ReadonlyArray<{ cueAnexo: string; lat: number | null; lon: number | null }>,
  colorPorCue: ReadonlyMap<string, string>,
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
        },
      }]
    }),
  }
}

export function puntosRiesgoSobreSituacion(
  escuelas: EscuelaMapaEnriquecida[],
  vista: Extract<VistaPlanificacion, 'aisladas' | 'inundacion'>,
  territorio: TerritorioMapa | null,
): FeatureCollection<Point, PropiedadesPuntoNivel> {
  const puntos = construirPuntosNivel(escuelas, coloresPlanificacion(escuelas, vista, { territorio }))
  return { ...puntos, features: puntos.features.filter(({ properties }) => properties.conDato) }
}
