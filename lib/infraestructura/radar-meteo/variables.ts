export const VARIABLES_RADAR = ['precipitation_probability','precipitation','wind_speed_10m','wind_gusts_10m','wind_direction_10m','cape','lifted_index','weather_code','freezing_level_height'] as const
export type VariableRadar = typeof VARIABLES_RADAR[number]
