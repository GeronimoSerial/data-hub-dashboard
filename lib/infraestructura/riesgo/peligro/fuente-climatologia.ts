/**
 * Selección de umbrales de precipitación a partir de filas de climatología.
 *
 * Las filas de UNA celda llegan ya ordenadas por recencia
 * (periodoHasta, version, calculadoEn desc) y ya filtradas a la fecha de corte.
 *
 * Los umbrales de precipitación salen de la climatología IMERG cuando está
 * completa para la celda (p90, p95 y p99 presentes). En caso contrario se usan
 * las filas restantes (ERA5 u otras). Nunca se mezclan percentiles de fuentes
 * distintas. Dentro de cada fuente gana la primera fila por percentil.
 *
 * Las versiones no IMERG (por ejemplo, climatologías de caudal) se comportan
 * igual que antes: primera fila por percentil.
 */

export type FilaUmbralClimatologia = { percentil: string; valor: number; version: string }
export type UmbralesClimatologia = { p90: number; p95: number; p99: number }

const PERCENTILES = ['p90', 'p95', 'p99'] as const

export function esVersionImerg(version: string): boolean {
  return version.startsWith('climatologia-imerg')
}

function primerValorPorPercentil(
  filas: readonly FilaUmbralClimatologia[],
): Partial<Record<(typeof PERCENTILES)[number], number>> {
  const porPercentil: Partial<Record<(typeof PERCENTILES)[number], number>> = {}
  for (const fila of filas) {
    const percentil = fila.percentil as (typeof PERCENTILES)[number]
    if (!PERCENTILES.includes(percentil) || porPercentil[percentil] !== undefined) continue
    porPercentil[percentil] = fila.valor
  }
  return porPercentil
}

function completarUmbrales(
  porPercentil: Partial<Record<(typeof PERCENTILES)[number], number>>,
): UmbralesClimatologia | null {
  const { p90, p95, p99 } = porPercentil
  if (p90 === undefined || p95 === undefined || p99 === undefined) return null
  return { p90, p95, p99 }
}

export function elegirUmbralesClimatologia(
  filasOrdenadas: readonly FilaUmbralClimatologia[],
): UmbralesClimatologia | null {
  const filasImerg = filasOrdenadas.filter((fila) => esVersionImerg(fila.version))
  const imerg = completarUmbrales(primerValorPorPercentil(filasImerg))
  if (imerg) return imerg

  const filasRestantes = filasOrdenadas.filter((fila) => !esVersionImerg(fila.version))
  return completarUmbrales(primerValorPorPercentil(filasRestantes))
}
