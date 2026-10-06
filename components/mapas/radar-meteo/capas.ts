export const CAPAS_RADAR = {
  mascara: 'radar-meteo-inverse-mask',
  borde: 'infra-departamentos-borde',
  etiqueta: 'infra-departamentos-etiqueta',
} as const

export function beforeIdSiExiste(map: { getLayer: (id: string) => unknown }, id: string): string | undefined {
  return map.getLayer(id) ? id : undefined
}
