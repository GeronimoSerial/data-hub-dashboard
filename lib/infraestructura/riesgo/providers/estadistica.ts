/** Cuenta días calendario inclusivos entre fechas YYYY-MM-DD (mínimo uno). */
export function diasEntreFechas(desde: string, hasta: string): number {
  const msPorDia = 86_400_000
  const dias = Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / msPorDia) + 1
  return Math.max(1, dias)
}

/** Percentil por índice ascendente: ceil(p / 100 * n) - 1, limitado a los extremos. */
export function calcularPercentil(valoresOrdenados: number[], percentil: number): number {
  const n = valoresOrdenados.length
  const indice = Math.min(Math.max(Math.ceil((percentil / 100) * n) - 1, 0), n - 1)
  return valoresOrdenados[indice]
}
