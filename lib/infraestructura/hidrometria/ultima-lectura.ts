// Map-facing view of a station's last reading. Unlike `estadoAltura`, an old reading
// keeps its level state here and is flagged as stale instead; the risk engine still
// uses `estadoAltura`, where a stale reading means sin_dato.

import { EDAD_MAXIMA_LECTURA_HORAS, estadoAltura, type EstadoAltura, type LecturaParaEstado } from './estado-altura'

const MS_POR_HORA = 3_600_000

export type EstadoUltimaLectura = {
  estado: EstadoAltura
  horasDesdeLectura: number | null
  vencida: boolean
}

export function estadoUltimaLectura(lectura: LecturaParaEstado | null, ahora: Date = new Date()): EstadoUltimaLectura {
  if (!lectura) return { estado: 'sin_dato', horasDesdeLectura: null, vencida: false }
  const { estado } = estadoAltura(lectura, { ahora, edadMaximaHoras: Number.POSITIVE_INFINITY })
  const instante = lectura.medidaEn ? Date.parse(lectura.medidaEn) : Number.NaN
  if (Number.isNaN(instante)) return { estado, horasDesdeLectura: null, vencida: false }
  const edadMs = Math.max(0, ahora.getTime() - instante)
  return { estado, horasDesdeLectura: Math.floor(edadMs / MS_POR_HORA), vencida: edadMs > EDAD_MAXIMA_LECTURA_HORAS * MS_POR_HORA }
}

export type PuntoNivel = { medidaEn: string; lecturaM: number | null }
export type Variacion = { deltaM: number; porcentaje: number | null }

/** Change between the last level and the latest level at or before `horas` earlier. */
export function variacionEnVentana(serie: readonly PuntoNivel[], horas: number): Variacion | null {
  const validos = serie
    .filter((p): p is { medidaEn: string; lecturaM: number } => p.lecturaM !== null && !Number.isNaN(Date.parse(p.medidaEn)))
    .sort((a, b) => Date.parse(a.medidaEn) - Date.parse(b.medidaEn))
  const ultimo = validos.at(-1)
  if (!ultimo) return null
  const limite = Date.parse(ultimo.medidaEn) - horas * MS_POR_HORA
  const previo = validos.filter((p) => Date.parse(p.medidaEn) <= limite).at(-1)
  if (!previo) return null
  const deltaM = redondear(ultimo.lecturaM - previo.lecturaM, 3)
  const porcentaje = previo.lecturaM === 0 ? null : redondear((deltaM / Math.abs(previo.lecturaM)) * 100, 1)
  return { deltaM, porcentaje }
}

/** Metres left until the threshold (negative once exceeded). */
export function distanciaAUmbral(lecturaM: number | null, umbralM: number | null): number | null {
  if (lecturaM === null || umbralM === null) return null
  return redondear(umbralM - lecturaM, 3)
}

function redondear(valor: number, decimales: number): number {
  const f = 10 ** decimales
  return Math.round(valor * f) / f
}
