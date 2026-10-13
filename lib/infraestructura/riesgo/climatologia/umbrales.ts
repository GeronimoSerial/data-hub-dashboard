// Umbrales de precipitación calculados desde la serie acumulada de UNA celda
// ERA5 (ver serie-diaria.ts). Función pura: no toca la base ni la red.
import { calcularPercentilesPrecipitacion } from '../providers/climatologia'
import type { HazardClimatologiaPunto } from '../tipos-hazard'
import { diasDelAnio } from './serie-diaria'

export const ANIOS_MINIMOS_CLIMATOLOGIA = 10

const FRACCION_MINIMA_ANIO_COMPLETO = 0.95

export type UmbralesAcumulados = {
  puntos: HazardClimatologiaPunto[]
  aniosCobertura: number
  diasCobertura: number
  periodoDesde: string
  periodoHasta: string
}

/**
 * Percentiles de precipitación diaria de una celda usando sólo los años
 * completos (>= 95 % de días con dato). Los nulos nunca cuentan como 0 mm.
 * Devuelve null si hay menos de ANIOS_MINIMOS_CLIMATOLOGIA años completos.
 */
export function calcularUmbralesAcumulados(params: {
  geometryRef: string
  anios: Array<{ anio: number; valores: Array<number | null> }>
}): UmbralesAcumulados | null {
  const completos = params.anios
    .filter(({ anio, valores }) => {
      const diasConDato = valores.filter((valor) => valor !== null).length
      return diasConDato >= FRACCION_MINIMA_ANIO_COMPLETO * diasDelAnio(anio)
    })
    .sort((a, b) => a.anio - b.anio)

  if (completos.length < ANIOS_MINIMOS_CLIMATOLOGIA) return null

  const valoresDiarios = completos.flatMap(({ valores }) =>
    valores.filter((valor): valor is number => valor !== null),
  )
  const primerAnio = completos[0].anio
  const ultimoAnio = completos[completos.length - 1].anio

  const puntos = calcularPercentilesPrecipitacion({
    geometryRef: params.geometryRef,
    valoresDiarios,
    periodoDesde: `${primerAnio}-01-01`,
    periodoHasta: `${ultimoAnio}-12-31`,
  })

  return {
    puntos,
    aniosCobertura: completos.length,
    diasCobertura: valoresDiarios.length,
    periodoDesde: `${primerAnio}-01-01`,
    periodoHasta: `${ultimoAnio}-12-31`,
  }
}
