export type EntradaGranizo = {
  weather_code: number | null
  precipitation_probability: number | null
  cape: number | null
  lifted_index: number | null
  wind_gusts_10m: number | null
  freezing_level_height: number | null
}

export type CategoriaGranizo = 0 | 1 | 2 | 3

// Bins de triaje sin calibrar, pendientes de validación contra reportes locales.
export const UMBRALES_GRANIZO = {
  probabilidadPrecipitacion: 40,
  capeCompuerta: 500,
  capeElevado: 1000,
  capeFuerte: 2000,
  indiceElevado: 0,
  indiceFuerte: -2,
  rafagaElevadora: 50,
  nivelCongelacionCalido: 4500,
} as const

function nivelEntorno(entrada: EntradaGranizo): CategoriaGranizo | null {
  const { precipitation_probability, cape, lifted_index } = entrada
  if (precipitation_probability === null || cape === null) return null
  if (
    precipitation_probability < UMBRALES_GRANIZO.probabilidadPrecipitacion ||
    cape < UMBRALES_GRANIZO.capeCompuerta
  ) return 0
  if (lifted_index === null) return null

  let nivel: CategoriaGranizo = 0
  if (cape >= UMBRALES_GRANIZO.capeElevado && lifted_index <= UMBRALES_GRANIZO.indiceElevado) nivel = 1
  if (cape >= UMBRALES_GRANIZO.capeFuerte && lifted_index <= UMBRALES_GRANIZO.indiceFuerte) nivel = 2
  if (entrada.wind_gusts_10m !== null && entrada.wind_gusts_10m >= UMBRALES_GRANIZO.rafagaElevadora && nivel > 0) {
    nivel = Math.min(3, nivel + 1) as CategoriaGranizo
  }
  if (entrada.freezing_level_height !== null && entrada.freezing_level_height > UMBRALES_GRANIZO.nivelCongelacionCalido) {
    nivel = Math.max(0, nivel - 1) as CategoriaGranizo
  }
  return nivel
}

export function categoriaGranizo(entrada: EntradaGranizo): CategoriaGranizo | null {
  const nivelWmo: CategoriaGranizo = entrada.weather_code === 99 ? 3 : entrada.weather_code === 96 ? 2 : 0
  const entorno = nivelEntorno(entrada)
  if (entorno === null) return nivelWmo > 0 ? nivelWmo : null
  return Math.max(nivelWmo, entorno) as CategoriaGranizo
}
