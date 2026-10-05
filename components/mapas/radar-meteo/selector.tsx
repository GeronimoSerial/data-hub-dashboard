export type VariableRadarUI = 'lluvia' | 'probabilidad' | 'viento' | 'granizo'

export const VARIABLES_RADAR_UI: VariableRadarUI[] = ['lluvia', 'probabilidad', 'viento', 'granizo']

export const ETIQUETAS_VARIABLE_RADAR: Record<VariableRadarUI, string> = {
  lluvia: 'Lluvia (mm)',
  probabilidad: 'Probabilidad',
  viento: 'Viento',
  granizo: 'Granizo (estimado)',
}
