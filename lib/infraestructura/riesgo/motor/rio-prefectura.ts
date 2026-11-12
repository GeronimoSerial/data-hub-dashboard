import type { EstadoNivelRio } from './puertos'

// Estados que produce la fuente Prefectura (umbrales oficiales de la estación).
export type EstadoRioPrefectura = 'normal' | 'alerta' | 'evacuacion'

// Traducción Prefectura -> neutral. Sólo la usa el adapter; el motor nunca
// ve estos nombres.
export const TRADUCCION_ESTADO_PREFECTURA: Record<EstadoRioPrefectura, EstadoNivelRio> = {
  normal: 'normal',
  alerta: 'alerta',
  evacuacion: 'evacuacion',
}

export { valorAmenazaRio } from './nivel-rio'

// Módulo puro: sin base de datos ni reloj. Todas las fechas llegan por parámetro.

export const MAX_ANTIGUEDAD_LECTURA_HORAS = 24
export const DISTANCIA_AGUA_MAX_M = 1000
export const ALTURA_SOBRE_AGUA_MAX_M = 10
export const DISTANCIA_PUNTO_RIO_MAX_KM = 3
// Margen = cota de la escuela (DEM Copernicus GLO-30) menos el nivel de agua
// del mapa JRC de inundación fluvial a 100 años: <= 1 m significa que la
// escuela está bajo, o a menos de 1 m sobre, la planicie de inundación del río.
export const MARGEN_RP100_MAX_M = 1
// FALLBACK, no criterio principal: las estaciones de Prefectura son un punto en
// el puerto. Sólo se usa la cercanía (<= 1.5 km) cuando la escuela NO tiene
// fila de susceptibilidad (sin margen ni clase de río propios). Coordenadas PNA
// declaradas, sin verificar (mismo proxy aprobado en G-1).
export const DISTANCIA_ESTACION_MAX_KM = 1.5

const MS_POR_HORA = 60 * 60 * 1000

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
  // Margen sobre el nivel RP100 (m); negativo = bajo el nivel de inundación.
  margenRp100M?: number | null
  // Profundidad máxima de inundación RP100 sobre la ruta de acceso (m).
  rutaProfundidadMaxM?: number | null
  // false = la escuela no tiene fila de susceptibilidad (habilita el fallback).
  tieneDatosSusceptibilidad?: boolean
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
  if (d.margenRp100M !== undefined && d.margenRp100M !== null && d.margenRp100M <= MARGEN_RP100_MAX_M) {
    return `margen_rp100=${d.margenRp100M.toFixed(1)}m`
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
    d.rutaProfundidadMaxM !== undefined &&
    d.rutaProfundidadMaxM !== null &&
    d.rutaProfundidadMaxM > 0
  ) {
    return `ruta_rp100=${d.rutaProfundidadMaxM.toFixed(1)}m`
  }
  if (
    d.tieneDatosSusceptibilidad === false &&
    d.distanciaEstacionKm !== undefined &&
    d.distanciaEstacionKm !== null &&
    d.distanciaEstacionKm <= DISTANCIA_ESTACION_MAX_KM
  ) {
    return `estacion_a_${d.distanciaEstacionKm.toFixed(1)}km(fallback)`
  }
  return null
}

// Un estado oficial de alerta o evacuación sobre el río propio de la escuela, con exposición
// física, es evidencia directa: la vulnerabilidad multiplicativa no debe borrarlo.
export const PISO_NIVEL_POR_ESTADO_RIO = {
  normal: null,
  alerta: 'moderado',
  evacuacion: 'alto',
} as const
