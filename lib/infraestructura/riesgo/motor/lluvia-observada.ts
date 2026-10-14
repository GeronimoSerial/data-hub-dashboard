// Valor normalizado (0..100) de la lluvia observada acumulada en una ventana.
//
// La climatología IMERG de la celda es la referencia preferida: el job de
// climatología IMERG escribe las variables de abajo con los percentiles 'P90',
// 'P95' y 'P99'. Mientras no exista para la celda, se usan los umbrales
// absolutos provisorios documentados. La lluvia nunca se ignora: si no hay
// climatología válida, el valor sigue calculándose con los umbrales absolutos.

import {
  UMBRALES_PROVISORIOS_MM,
  VERSION_UMBRALES_PROVISORIOS,
} from '../peligro/umbrales-provisorios'

export const VARIABLE_CLIMATOLOGIA_OBSERVADA = {
  24: 'precipitacion_observada_24h',
  72: 'precipitacion_observada_72h',
} as const

export type ClimatologiaObservada = {
  p90: number
  p95: number
  p99: number
  version: string
}

export type ValorLluviaObservada = {
  valor: number
  metodo: 'climatologia' | 'umbral_absoluto'
  referencia: string
}

type Umbrales = { t1: number; t2: number; t3: number }

function climatologiaValida(climatologia: ClimatologiaObservada | null): climatologia is ClimatologiaObservada {
  if (climatologia === null) return false
  const { p90, p95, p99 } = climatologia
  return p90 > 0 && p90 < p95 && p95 < p99
}

function normalizar(mm: number, umbrales: Umbrales): number {
  const { t1, t2, t3 } = umbrales
  if (mm <= 0) return 0
  let valor: number
  if (mm < t1) valor = (mm / t1) * 33
  else if (mm < t2) valor = 33 + ((mm - t1) / (t2 - t1)) * 33
  else if (mm < t3) valor = 66 + ((mm - t2) / (t3 - t2)) * 34
  else valor = 100
  return Math.round(valor * 10) / 10
}

export function valorLluviaObservada(
  mm: number,
  ventanaHoras: 24 | 72,
  climatologia: ClimatologiaObservada | null,
): ValorLluviaObservada {
  if (climatologiaValida(climatologia)) {
    const { p90, p95, p99, version } = climatologia
    return {
      valor: normalizar(mm, { t1: p90, t2: p95, t3: p99 }),
      metodo: 'climatologia',
      referencia: `climatologia ${version} P90/P95/P99 = ${p90}/${p95}/${p99} mm`,
    }
  }

  const umbrales = UMBRALES_PROVISORIOS_MM[ventanaHoras]
  return {
    valor: normalizar(mm, { t1: umbrales.amarillo, t2: umbrales.naranja, t3: umbrales.rojo }),
    metodo: 'umbral_absoluto',
    referencia: `${VERSION_UMBRALES_PROVISORIOS} ${umbrales.amarillo}/${umbrales.naranja}/${umbrales.rojo} mm (sin climatología de la celda)`,
  }
}
