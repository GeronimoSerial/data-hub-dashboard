// Exposición v0.4 (F3): ¿el agua POSIBLE dentro del horizonte alcanza el
// terreno de la escuela? Módulo puro, sin DB ni reloj. Reemplaza, sólo con
// reglas v0.4, la compuerta de v0.3 (DEM a ≤ 500 m O cualquier capa gruesa:
// celda JRC/WRI, ruta RP100, agua GSW, punto de río, cercanía a la estación).
// Ver docs/motor-v0.4/auditoria-v03.md (F3).
//
// 1. DEM evaluable (suelo y agua a ≤ 2 km, no embalse, el agua es el río del
//    tramo): agua_posible = nivel_rio_dem + anomalía + subida_posible(h);
//    margen = agua_posible + MARGEN_ERROR_DEM − suelo → completo (≥ 0),
//    reducido (≥ −BANDA) o ninguno. La anomalía se mide contra la mediana de
//    largo plazo (T10c); con cero efectivo calibrado de la estación del tramo,
//    agua_posible = a + b·(h + subida) y el DEM sólo valida que el agua cercana
//    sea el río. La regla equivale a h + subida ≥ altura crítica de la escala.
// 2. No evaluable: respaldo SÓLO con `clase_rio` JRC 90 m, con confianza baja.
//    La ruta RP100 sale de la exposición (queda en la dimensión de acceso).
import type { HorizontePeligro } from './puertos'
import type { DatosDemEscuela } from './exposicion-dinamica'
import { TOLERANCIA_NIVEL_RIO_M, UMBRAL_EMBALSE_M } from './exposicion-dinamica'
import type { EscenarioHorizonte, EscenarioSubidaEstacion } from './escenarios-subida'
import { BANDA_EXPOSICION_V04_M, DISTANCIA_DATOS_DEM_V04_M, MARGEN_ERROR_DEM_V04_M, TOLERANCIA_RIO_CERO_EFECTIVO_V04_M } from './config'
import { alturaCriticaCeroEfectivo, cotaAguaCeroEfectivo, type CeroEfectivo } from './referencia-nivel'

const HORIZONTES: readonly HorizontePeligro[] = [24, 72, 240]
const CLASES_RIO_EXPUESTAS = new Set(['alto', 'medio', 'bajo'])
const redondear2 = (x: number) => Math.round(x * 100) / 100

export type AlcanceExposicion = 'completo' | 'reducido' | 'ninguno'

/** Origen de la referencia del nivel (T10c). */
export type ReferenciaNivelV04 = 'largo_plazo' | 'mediana_365_inestable' | 'cero_efectivo'

export type RecordEscala = { valorM: number; fecha: string }

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
  /** T10c: referencia usada, altura crítica en la escala del tramo y récord. */
  referencia?: ReferenciaNivelV04 | null
  alturaCriticaM?: number | null
  alturaCriticaBandaM?: number | null
  h0M?: number | null
  record?: RecordEscala | null
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
  /** T10c: origen de la referencia de la anomalía (por defecto largo plazo). */
  referencia?: Exclude<ReferenciaNivelV04, 'cero_efectivo'>
  /** Altura vigente en la escala de la estación del tramo. */
  h0M?: number | null
  /** Cero efectivo calibrado de la estación del tramo y su altura de referencia. */
  ceroEfectivo?: CeroEfectivo | null
  hReferenciaM?: number | null
  record?: RecordEscala | null
}): ResultadoExposicionV04 {
  const { dem, nivelRioTramoM, anomaliaM } = params
  const h0M = params.h0M ?? null
  const cero = params.ceroEfectivo ?? null
  const extra = { h0M, record: params.record ?? null }
  const completo = dem !== null && dem.sueloM !== null && dem.nivelRioDemM !== null && dem.distanciaRioM !== null
  let motivoNoEvaluable = 'sin DEM o sin agua a <= 2 km'
  if (completo && dem.distanciaRioM! <= DISTANCIA_DATOS_DEM_V04_M) {
    const sueloM = dem.sueloM!
    const nivelRioDemM = dem.nivelRioDemM!
    if (params.represaAguasArriba && nivelRioTramoM !== null && nivelRioDemM - nivelRioTramoM > UMBRAL_EMBALSE_M) {
      return { tipo: 'no_aplica_embalse', detalle: `agua a ${nivelRioDemM} m frente a tramo de río a ${nivelRioTramoM} m: embalse o agua colgada` }
    }
    const rioEsperadoM = cero && params.hReferenciaM != null ? cotaAguaCeroEfectivo(cero, params.hReferenciaM) : null
    if (cero && (rioEsperadoM === null || Math.abs(nivelRioDemM - rioEsperadoM) > TOLERANCIA_RIO_CERO_EFECTIVO_V04_M)) {
      motivoNoEvaluable = rioEsperadoM === null
        ? 'cero efectivo sin altura de referencia para validar el agua del DEM'
        : `agua cercana a ${nivelRioDemM} m no es el río (esperado ${rioEsperadoM} m por cero efectivo)`
    } else if (cero && h0M !== null) {
      const { alturaCriticaM, alturaCriticaBandaM } = alturaCriticaCeroEfectivo(cero, sueloM, MARGEN_ERROR_DEM_V04_M, BANDA_EXPOSICION_V04_M)
      const porHorizonte = {} as Record<HorizontePeligro, ExposicionHorizonteV04>
      for (const h of HORIZONTES) {
        const escenario = params.escenario?.porHorizonte[h] ?? null
        const aguaPosibleM = cotaAguaCeroEfectivo(cero, h0M + (escenario?.posibleM ?? 0))
        const margenM = redondear2(aguaPosibleM + MARGEN_ERROR_DEM_V04_M - sueloM)
        porHorizonte[h] = {
          criterio: 'dem_agua_posible',
          alcance: alcanceDe(margenM),
          margenM,
          sueloM,
          nivelRioDemM,
          anomaliaM,
          aguaPosibleM,
          subida: escenario ? { ...escenario, tasaMediaM: params.escenario?.tasaMediaM ?? null } : null,
          confianzaBaja: false,
          detalle: `DEM a ${dem.distanciaRioM} m del agua; cero efectivo a=${cero.aM} b=${cero.bM}`,
          referencia: 'cero_efectivo',
          alturaCriticaM,
          alturaCriticaBandaM,
          ...extra,
        }
      }
      return { tipo: 'evaluada', porHorizonte }
    } else if (!cero && nivelRioTramoM !== null && Math.abs(nivelRioDemM - nivelRioTramoM) > TOLERANCIA_NIVEL_RIO_M) {
      motivoNoEvaluable = `agua cercana a ${nivelRioDemM} m no es el río (tramo a ${nivelRioTramoM} m)`
    } else if (anomaliaM === null || (cero && h0M === null)) {
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
        const alcance = alcanceDe(margenM)
        // Referencia equivalente de la escala: h0 − anomalía interpolada.
        const hCrit = h0M === null ? null : redondear2(sueloM - MARGEN_ERROR_DEM_V04_M - nivelRioDemM + h0M - anomaliaM!)
        const referencia = params.referencia ?? 'largo_plazo'
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
          detalle: `DEM a ${dem.distanciaRioM} m del agua${referencia === 'mediana_365_inestable' ? '; referencia_inestable (mediana 365 d)' : ''}`,
          referencia,
          alturaCriticaM: hCrit,
          alturaCriticaBandaM: hCrit === null ? null : redondear2(hCrit - BANDA_EXPOSICION_V04_M),
          ...extra,
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
    referencia: null,
    alturaCriticaM: null,
    alturaCriticaBandaM: null,
    ...extra,
    detalle: `${motivoNoEvaluable}${jrc ? `; clase_rio JRC ${params.claseRio}` : ''}`,
  }
  return { tipo: 'evaluada', porHorizonte: { 24: respaldo, 72: respaldo, 240: respaldo } }
}

function alcanceDe(margenM: number): AlcanceExposicion {
  return margenM >= 0 ? 'completo' : margenM >= -BANDA_EXPOSICION_V04_M ? 'reducido' : 'ninguno'
}

/** Texto de formato fijo para la explicación del factor río (se persiste). */
export function explicacionExposicionV04(e: ExposicionHorizonteV04, h: HorizontePeligro): string {
  const cabeza = `exposicion v0.4 a ${h}h: criterio ${e.criterio}; alcance ${e.alcance}`
  if (e.criterio !== 'dem_agua_posible') return `${cabeza}; ${e.detalle}${e.confianzaBaja ? ' (confianza baja)' : ''}`
  const s = e.subida
  const subida = s
    ? `subida ${s.posibleM} por ${s.decide} [analogos_p90 ${s.analogosP90M ?? 's/d'}, tendencia ${s.tendenciaMediaM ?? 's/d'} a ${s.tasaMediaM ?? 's/d'} m/dia, onda ${s.ondaM}]`
    : 'subida 0 por sin_escenario'
  const formula = e.referencia === 'cero_efectivo' ? `${e.detalle.replace(/^.*; /, '')}·(h ${e.h0M} + ${subida})` : `dem ${e.nivelRioDemM} + anomalia ${e.anomaliaM} + ${subida}`
  const escala = e.alturaCriticaM != null
    ? `; se alcanza con ${e.alturaCriticaM}m en la escala (banda ${e.alturaCriticaBandaM}m); hoy ${e.h0M ?? 's/d'}m; record ${e.record ? `${e.record.valorM}m (${e.record.fecha.slice(0, 4)})` : 's/d'}`
    : ''
  const inestable = e.referencia === 'mediana_365_inestable' ? '; referencia_inestable' : ''
  return `${cabeza}; margen ${e.margenM}m (suelo ${e.sueloM}m, agua posible ${e.aguaPosibleM}m = ${formula}; margen_error ${MARGEN_ERROR_DEM_V04_M}m; banda ${BANDA_EXPOSICION_V04_M}m)${escala}${inestable}`
}
