/**
 * Acumulado de precipitación SYNOP para una ventana móvil. Función pura: recibe
 * registros ya decodificados y devuelve el total, sin E/S.
 */
import type { PrecipitacionSynop } from './synop-parser'

/** Mínimo de periodos de 6 h presentes para estimar una ventana de 72 h. */
export const MIN_PERIODOS_72H = 10

export type AcumuladoSynop = {
  acumuladoMm: number
  observadoEn: string
  periodosCubiertos: number
  periodosEsperados: number
}

const HORA_MS = 3_600_000
const PERIODO_MS = 6 * HORA_MS
const PERIODOS_24H = 4
const PERIODOS_72H = 12

/** Última hora sinóptica (00/06/12/18 UTC) menor o igual a `ms`. */
function sinopticaPrevia(ms: number): number {
  return Math.floor(ms / PERIODO_MS) * PERIODO_MS
}

function redondear(mm: number): number {
  return Math.round(mm * 10) / 10
}

/** Registros de 6 h indexados por fin del periodo; prefiere la sección 1. */
function indexarPeriodos6h(
  registros: readonly PrecipitacionSynop[],
  asOfMs: number,
): Map<number, PrecipitacionSynop> {
  const porFin = new Map<number, PrecipitacionSynop>()
  for (const registro of registros) {
    if (registro.periodoHoras !== 6) continue
    const finMs = Date.parse(registro.observadoEn)
    if (finMs > asOfMs) continue
    const existente = porFin.get(finMs)
    if (!existente || (existente.seccion === 3 && registro.seccion === 1)) {
      porFin.set(finMs, registro)
    }
  }
  // Muchas estaciones SMN informan a las 12Z sólo el total de 24 h (t=4), sin el
  // de 6 h. Si están los tres períodos de 6 h previos dentro de esas 24 h, el
  // faltante es exacto: 24h(X) - (X-6 + X-12 + X-18). Una diferencia negativa
  // (redondeo de la fuente) queda en 0.
  for (const registro of registros) {
    if (registro.periodoHoras !== 24) continue
    const finMs = Date.parse(registro.observadoEn)
    if (finMs > asOfMs || porFin.has(finMs)) continue
    const previos = [1, 2, 3].map((i) => porFin.get(finMs - i * PERIODO_MS))
    if (previos.some((p) => p === undefined)) continue
    const sumaPrevios = previos.reduce((suma, p) => suma + (p?.precipitacionMm ?? 0), 0)
    porFin.set(finMs, {
      ...registro,
      periodoHoras: 6,
      precipitacionMm: redondear(Math.max(0, registro.precipitacionMm - sumaPrevios)),
      traza: false,
    })
  }
  return porFin
}

/** Registro de 24 h que termina dentro de (asOf-6h, asOf]; prefiere la sección 1. */
function buscarPeriodo24h(
  registros: readonly PrecipitacionSynop[],
  asOfMs: number,
): { finMs: number; registro: PrecipitacionSynop } | null {
  let mejor: { finMs: number; registro: PrecipitacionSynop } | null = null
  for (const registro of registros) {
    if (registro.periodoHoras !== 24) continue
    const finMs = Date.parse(registro.observadoEn)
    if (finMs > asOfMs || finMs <= asOfMs - PERIODO_MS) continue
    if (!mejor || (mejor.registro.seccion === 3 && registro.seccion === 1)) {
      mejor = { finMs, registro }
    }
  }
  return mejor
}

/**
 * Acumula precipitación de las últimas `ventanaHoras` horas hasta la hora
 * sinóptica previa a `asOf`. En 24 h exige los 4 periodos de 6 h o usa un
 * registro de 24 h como respaldo. En 72 h suma los periodos presentes si son
 * al menos MIN_PERIODOS_72H (estimación conservadora, cota inferior).
 */
export function acumularSynop(
  registros: readonly PrecipitacionSynop[],
  asOf: string,
  ventanaHoras: 24 | 72,
): AcumuladoSynop | null {
  const asOfMs = Date.parse(asOf)
  const finMs = sinopticaPrevia(asOfMs)
  const periodosEsperados = ventanaHoras === 24 ? PERIODOS_24H : PERIODOS_72H
  const porFin = indexarPeriodos6h(registros, asOfMs)

  const finesEsperados = Array.from({ length: periodosEsperados }, (_, i) => finMs - i * PERIODO_MS)
  const finesPresentes = finesEsperados.filter((fin) => porFin.has(fin))

  if (ventanaHoras === 24) {
    if (finesPresentes.length === PERIODOS_24H) {
      const total = finesPresentes.reduce((suma, fin) => suma + (porFin.get(fin)?.precipitacionMm ?? 0), 0)
      return {
        acumuladoMm: redondear(total),
        observadoEn: new Date(finMs).toISOString(),
        periodosCubiertos: PERIODOS_24H,
        periodosEsperados: PERIODOS_24H,
      }
    }
    const respaldo = buscarPeriodo24h(registros, asOfMs)
    if (!respaldo) return null
    return {
      acumuladoMm: redondear(respaldo.registro.precipitacionMm),
      observadoEn: new Date(respaldo.finMs).toISOString(),
      periodosCubiertos: PERIODOS_24H,
      periodosEsperados: PERIODOS_24H,
    }
  }

  if (finesPresentes.length < MIN_PERIODOS_72H) return null
  const total = finesPresentes.reduce((suma, fin) => suma + (porFin.get(fin)?.precipitacionMm ?? 0), 0)
  return {
    acumuladoMm: redondear(total),
    observadoEn: new Date(Math.max(...finesPresentes)).toISOString(),
    periodosCubiertos: finesPresentes.length,
    periodosEsperados: PERIODOS_72H,
  }
}
