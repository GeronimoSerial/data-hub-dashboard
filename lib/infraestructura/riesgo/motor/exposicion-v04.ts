// Exposición v0.4 (F3): ¿el agua POSIBLE dentro del horizonte alcanza el
// terreno de la escuela? Módulo puro, sin DB ni reloj. Reemplaza, sólo con
// reglas v0.4, la compuerta de v0.3 (DEM a ≤ 500 m O cualquier capa gruesa:
// celda JRC/WRI, ruta RP100, agua GSW, punto de río, cercanía a la estación).
// Ver docs/motor-v0.4/auditoria-v03.md (F3).
//
// 1. DEM evaluable (suelo y agua a ≤ 2 km, no embalse, el agua es el río del
//    tramo): agua_posible = nivel_rio_dem + anomalía + subida_posible(h);
//    margen = agua_posible + MARGEN_ERROR_DEM − suelo → completo (≥ 0),
//    reducido (≥ −BANDA) o ninguno.
// 2. No evaluable: respaldo SÓLO con `clase_rio` JRC 90 m, con confianza baja.
//    La ruta RP100 sale de la exposición (queda en la dimensión de acceso).
import type { HorizontePeligro } from './puertos'
import type { DatosDemEscuela } from './exposicion-dinamica'
import { TOLERANCIA_NIVEL_RIO_M, UMBRAL_EMBALSE_M } from './exposicion-dinamica'
import type { EscenarioHorizonte, EscenarioSubidaEstacion } from './escenarios-subida'
import { BANDA_EXPOSICION_V04_M, DISTANCIA_DATOS_DEM_V04_M, MARGEN_ERROR_DEM_V04_M } from './config'

const HORIZONTES: readonly HorizontePeligro[] = [24, 72, 240]
const CLASES_RIO_EXPUESTAS = new Set(['alto', 'medio', 'bajo'])
const redondear2 = (x: number) => Math.round(x * 100) / 100

export type AlcanceExposicion = 'completo' | 'reducido' | 'ninguno'

export type ExposicionHorizonteV04 = {
  criterio: 'dem_agua_posible' | 'jrc_respaldo' | 'no_evaluable'
  alcance: AlcanceExposicion
  /** agua_posible + margen de error − suelo (m); null fuera del DEM. */
  margenM: number | null
  sueloM: number | null
  nivelRioDemM: number | null
  anomaliaM: number | null
  aguaPosibleM: number | null
  /** Escenario de subida usado; null = sin escenario de la estación (subida 0). */
  subida: (EscenarioHorizonte & { tasaMediaM: number | null }) | null
  confianzaBaja: boolean
  detalle: string
}

export type ResultadoExposicionV04 =
  | { tipo: 'no_aplica_embalse'; detalle: string }
  | { tipo: 'sin_dato'; detalle: string }
  | { tipo: 'evaluada'; porHorizonte: Record<HorizontePeligro, ExposicionHorizonteV04> }

export function evaluarExposicionV04(params: {
  dem: DatosDemEscuela | null
  nivelRioTramoM: number | null
  anomaliaM: number | null
  represaAguasArriba: boolean
  /** `clase_rio` JRC 90 m de la susceptibilidad (respaldo no evaluable). */
  claseRio: string | null
  escenario: EscenarioSubidaEstacion | null
}): ResultadoExposicionV04 {
  const { dem, nivelRioTramoM, anomaliaM } = params
  const completo = dem !== null && dem.sueloM !== null && dem.nivelRioDemM !== null && dem.distanciaRioM !== null
  let motivoNoEvaluable = 'sin DEM o sin agua a <= 2 km'
  if (completo && dem.distanciaRioM! <= DISTANCIA_DATOS_DEM_V04_M) {
    const sueloM = dem.sueloM!
    const nivelRioDemM = dem.nivelRioDemM!
    if (params.represaAguasArriba && nivelRioTramoM !== null && nivelRioDemM - nivelRioTramoM > UMBRAL_EMBALSE_M) {
      return { tipo: 'no_aplica_embalse', detalle: `agua a ${nivelRioDemM} m frente a tramo de río a ${nivelRioTramoM} m: embalse o agua colgada` }
    }
    if (nivelRioTramoM !== null && Math.abs(nivelRioDemM - nivelRioTramoM) > TOLERANCIA_NIVEL_RIO_M) {
      motivoNoEvaluable = `agua cercana a ${nivelRioDemM} m no es el río (tramo a ${nivelRioTramoM} m)`
    } else if (anomaliaM === null) {
      if (!CLASES_RIO_EXPUESTAS.has(params.claseRio ?? '')) {
        return { tipo: 'sin_dato', detalle: 'DEM evaluable sin nivel actual / referencia de estación' }
      }
      motivoNoEvaluable = 'sin nivel actual / referencia de estación'
    } else {
      const porHorizonte = {} as Record<HorizontePeligro, ExposicionHorizonteV04>
      for (const h of HORIZONTES) {
        const escenario = params.escenario?.porHorizonte[h] ?? null
        const subidaM = escenario?.posibleM ?? 0
        const aguaPosibleM = redondear2(nivelRioDemM + anomaliaM + subidaM)
        const margenM = redondear2(aguaPosibleM + MARGEN_ERROR_DEM_V04_M - sueloM)
        const alcance: AlcanceExposicion = margenM >= 0 ? 'completo' : margenM >= -BANDA_EXPOSICION_V04_M ? 'reducido' : 'ninguno'
        porHorizonte[h] = {
          criterio: 'dem_agua_posible',
          alcance,
          margenM,
          sueloM,
          nivelRioDemM,
          anomaliaM,
          aguaPosibleM,
          subida: escenario ? { ...escenario, tasaMediaM: params.escenario?.tasaMediaM ?? null } : null,
          confianzaBaja: false,
          detalle: `DEM a ${dem.distanciaRioM} m del agua`,
        }
      }
      return { tipo: 'evaluada', porHorizonte }
    }
  } else if (completo) {
    motivoNoEvaluable = `agua a ${dem.distanciaRioM} m (> ${DISTANCIA_DATOS_DEM_V04_M} m)`
  }
  const jrc = CLASES_RIO_EXPUESTAS.has(params.claseRio ?? '')
  const respaldo: ExposicionHorizonteV04 = {
    criterio: jrc ? 'jrc_respaldo' : 'no_evaluable',
    alcance: jrc ? 'completo' : 'ninguno',
    margenM: null,
    sueloM: null,
    nivelRioDemM: null,
    anomaliaM,
    aguaPosibleM: null,
    subida: null,
    confianzaBaja: jrc,
    detalle: `${motivoNoEvaluable}${jrc ? `; clase_rio JRC ${params.claseRio}` : ''}`,
  }
  return { tipo: 'evaluada', porHorizonte: { 24: respaldo, 72: respaldo, 240: respaldo } }
}

/** Texto de formato fijo para la explicación del factor río (se persiste). */
export function explicacionExposicionV04(e: ExposicionHorizonteV04, h: HorizontePeligro): string {
  const cabeza = `exposicion v0.4 a ${h}h: criterio ${e.criterio}; alcance ${e.alcance}`
  if (e.criterio !== 'dem_agua_posible') return `${cabeza}; ${e.detalle}${e.confianzaBaja ? ' (confianza baja)' : ''}`
  const s = e.subida
  const subida = s
    ? `subida ${s.posibleM} por ${s.decide} [analogos_p90 ${s.analogosP90M ?? 's/d'}, tendencia ${s.tendenciaMediaM ?? 's/d'} a ${s.tasaMediaM ?? 's/d'} m/dia, onda ${s.ondaM}]`
    : 'subida 0 por sin_escenario'
  return `${cabeza}; margen ${e.margenM}m (suelo ${e.sueloM}m, agua posible ${e.aguaPosibleM}m = dem ${e.nivelRioDemM} + anomalia ${e.anomaliaM} + ${subida}; margen_error ${MARGEN_ERROR_DEM_V04_M}m; banda ${BANDA_EXPOSICION_V04_M}m)`
}
