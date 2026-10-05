import type { CircleLayerSpecification, ExpressionSpecification } from 'maplibre-gl'
import type { EscuelaMapaEnriquecida, GravedadMapa } from './tipos'

export const RADIOS_ESCUELA_SIN_REPORTE = [[6, 3], [10, 5], [14, 6]] as const

export type IconoPunto = 'sin' | 'parcial' | 'evacuado' | 'centro' | 'reloj'

export function iconoPunto(escuela: EscuelaMapaEnriquecida): IconoPunto | null {
  if (escuela.clases !== 'normal') return escuela.clases
  return escuela.sinActualizar ? 'reloj' : null
}

export function radioPunto(gravedad: GravedadMapa): number {
  return gravedad === 0 ? 5 : 8
}

export function radioEscuelaSinReporte(): ExpressionSpecification {
  return ['interpolate', ['linear'], ['zoom'], ...RADIOS_ESCUELA_SIN_REPORTE.flat()]
}

export function radioPuntoNivel(): ExpressionSpecification {
  return [
    'interpolate', ['linear'], ['zoom'],
    ...RADIOS_ESCUELA_SIN_REPORTE.flatMap(([zoom, radio]) => [
      zoom,
      ['case', ['get', 'conDato'], radioPunto(1), radio],
    ]),
  ] as ExpressionSpecification
}

export function colorEscuelaSinReporte(oscuro: boolean): string {
  // `--page` en globals.css; MapLibre no resuelve var().
  return oscuro ? '#000000' : '#ffffff'
}

export function colorBordeSinReporte(oscuro: boolean): string {
  // `--ink-faint` en globals.css; MapLibre no resuelve var().
  return oscuro ? '#9b9895' : '#8a8886'
}

export function circlePaintEscuelasSinReporte(oscuro: boolean): CircleLayerSpecification['paint'] {
  return {
    'circle-radius': radioEscuelaSinReporte(),
    'circle-color': colorEscuelaSinReporte(oscuro),
    'circle-stroke-color': colorBordeSinReporte(oscuro),
    'circle-stroke-width': 1.5,
    'circle-opacity': 1,
  }
}
