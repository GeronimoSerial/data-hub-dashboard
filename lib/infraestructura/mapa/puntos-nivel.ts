import type { FeatureCollection, Point } from 'geojson'

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
