import type { EstadoRioPrefectura, EvidenciaRioPrefectura } from './puertos'

// Módulo puro: sin base de datos ni reloj. Todas las fechas llegan por parámetro.

export const MAX_ANTIGUEDAD_LECTURA_HORAS = 24
export const DISTANCIA_AGUA_MAX_M = 1000
export const ALTURA_SOBRE_AGUA_MAX_M = 10
export const DISTANCIA_PUNTO_RIO_MAX_KM = 3
// Proxy de ribera: las estaciones de Prefectura están en el puerto, sobre la
// costa. Sin geometría de río en el repo, una escuela a <= 1.5 km de la
// estación de su tramo se considera expuesta. Medido contra la realidad local
// (dump 2026-10-13): los indicadores G1 dan `sin_riesgo` y distancia al agua
// nula para las 45 escuelas de Paso de los Libres, y su punto GloFAS queda a
// 24 km. Coordenadas PNA declaradas, sin verificar (mismo proxy aprobado en
// G-1 para tramos dudosos). Follow-up: reemplazar por distancia a la línea de
// ribera cuando exista la geometría.
export const DISTANCIA_ESTACION_MAX_KM = 1.5

const MS_POR_HORA = 60 * 60 * 1000
const AMENAZA_MAX_NORMAL = 33
const AMENAZA_ALERTA = 66
const AMENAZA_BONUS_CRECIENTE = 10
const AMENAZA_EVACUACION = 100

export function estadoDeLectura(
  lecturaM: number,
  alertaM: number | null,
  evacuacionM: number | null,
): EstadoRioPrefectura | null {
  if (evacuacionM !== null && lecturaM >= evacuacionM) return 'evacuacion'
  if (alertaM !== null && lecturaM >= alertaM) return 'alerta'
  if (alertaM === null && evacuacionM === null) return null
  return 'normal'
}

export function lecturaVigente(
  medidaEn: string,
  asOf: string,
  maxHoras: number = MAX_ANTIGUEDAD_LECTURA_HORAS,
): boolean {
  const medidaMs = Date.parse(medidaEn)
  const asOfMs = Date.parse(asOf)
  if (Number.isNaN(medidaMs) || Number.isNaN(asOfMs)) return false
  const diffMs = asOfMs - medidaMs
  return diffMs >= 0 && diffMs <= maxHoras * MS_POR_HORA
}

export type DatosExposicionRio = {
  claseRio: string | null
  peligroInundacionFluvial: number | null
  distanciaAguaM: number | null
  alturaSobreAguaM: number | null
  juntoLaguna: boolean | null
  distanciaPuntoRioKm: number | null
  // Distancia escuela -> estación de Prefectura del tramo (null si la estación
  // no tiene coordenada con precisión suficiente).
  distanciaEstacionKm?: number | null
}

// Devuelve la etiqueta del primer criterio que coincide, o null si la escuela no está expuesta.
export function evaluarExposicionRio(d: DatosExposicionRio): string | null {
  if (d.claseRio === 'alto' || d.claseRio === 'medio' || d.claseRio === 'bajo') {
    return `clase_rio=${d.claseRio}`
  }
  if (d.peligroInundacionFluvial !== null && d.peligroInundacionFluvial > 0) {
    return `peligro_fluvial=${d.peligroInundacionFluvial}`
  }
  if (
    d.distanciaAguaM !== null &&
    d.distanciaAguaM <= DISTANCIA_AGUA_MAX_M &&
    d.alturaSobreAguaM !== null &&
    d.alturaSobreAguaM <= ALTURA_SOBRE_AGUA_MAX_M &&
    d.juntoLaguna !== true
  ) {
    return `agua_a_${Math.round(d.distanciaAguaM)}m`
  }
  if (d.distanciaPuntoRioKm !== null && d.distanciaPuntoRioKm <= DISTANCIA_PUNTO_RIO_MAX_KM) {
    return `punto_rio_a_${d.distanciaPuntoRioKm.toFixed(1)}km`
  }
  if (
    d.distanciaEstacionKm !== undefined &&
    d.distanciaEstacionKm !== null &&
    d.distanciaEstacionKm <= DISTANCIA_ESTACION_MAX_KM
  ) {
    return `estacion_a_${d.distanciaEstacionKm.toFixed(1)}km`
  }
  return null
}

export function valorAmenazaRio(
  ev: Pick<EvidenciaRioPrefectura, 'estado' | 'lecturaM' | 'alertaM' | 'variacionM'>,
): number {
  if (ev.estado === 'evacuacion') return AMENAZA_EVACUACION
  if (ev.estado === 'alerta') {
    return AMENAZA_ALERTA + (ev.variacionM !== null && ev.variacionM > 0 ? AMENAZA_BONUS_CRECIENTE : 0)
  }
  if (ev.alertaM === null || ev.alertaM <= 0) return 0
  const proporcional = Math.min(AMENAZA_MAX_NORMAL, (ev.lecturaM / ev.alertaM) * AMENAZA_MAX_NORMAL)
  return Math.round(proporcional * 10) / 10
}

// Un estado oficial de alerta o evacuación sobre el río propio de la escuela, con exposición
// física, es evidencia directa: la vulnerabilidad multiplicativa no debe borrarlo.
export const PISO_NIVEL_POR_ESTADO_RIO = {
  normal: null,
  alerta: 'moderado',
  evacuacion: 'alto',
} as const
