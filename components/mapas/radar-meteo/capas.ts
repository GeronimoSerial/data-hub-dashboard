export const CAPAS_RADAR = {
  mascara: 'radar-meteo-inverse-mask',
  borde: 'infra-departamentos-borde',
  etiqueta: 'infra-departamentos-etiqueta',
} as const

export function antesDelRaster(inverseMaskAvailable: boolean) {
  return inverseMaskAvailable ? CAPAS_RADAR.mascara : CAPAS_RADAR.borde
}
