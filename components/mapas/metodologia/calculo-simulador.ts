import {
  BASE_COMBINACION_V04, CONFIANZA_MEDIA_MAX_FALTANTES,
  HISTORIAL_TOPE_CANTIDAD, HISTORIAL_TOPE_DURACION_HORAS, HISTORIAL_TOPE_ACCESO_INTERRUMPIDO,
  PESOS_AMENAZA, PESOS_VULNERABILIDAD,
  PISO_AMENAZA_POR_ESTADO_RIO, PISO_AMENAZA_REDUCIDO_V04,
  PISO_RIESGO_POR_ESTADO_RIO, PISO_RIESGO_REDUCIDO_V04,
  PISO_RIESGO_P_ALTO_V04, PISO_RIESGO_P_MODERADO_V04,
  TOPE_PROFUNDIDAD_FLUVIAL_V04_M, UMBRAL_P_ALTO_V04, UMBRAL_P_MODERADO_V04,
} from '@/lib/infraestructura/riesgo/motor/config'
import { valorLluviaObservada, type ClimatologiaObservada } from '@/lib/infraestructura/riesgo/motor/lluvia-observada'
import { valorAmenazaRio } from '@/lib/infraestructura/riesgo/motor/rio-prefectura'
import type { AlcanceExposicion } from '@/lib/infraestructura/riesgo/motor/exposicion-v04'
import type { EvidenciaRioPrefectura, HorizontePeligro } from '@/lib/infraestructura/riesgo/motor/puertos'

export type EntradaSimulador = {
  horizonte: HorizontePeligro
  peligro: number | null
  caudal: number | null
  lluviaMm: number | null
  climatologia?: ClimatologiaObservada | null
  historial: { cantidad: number; horas: number; accesos: number } | null
  profundidadM: number | null
  principal: number | null
  conservador: number | null
  rio: Pick<EvidenciaRioPrefectura, 'estado' | 'lecturaM' | 'alertaM' | 'variacionM'> | 'sin_dato' | null
  // Compuerta ya resuelta por terreno/altura crítica y defensas. El simulador
  // numérico no reproduce la preparación hidrológica de los insumos.
  alcance: AlcanceExposicion
  exposicionIncierta?: boolean
  peligroProvisorio?: boolean
  aislamientoDisponible?: boolean
}

const redondear2 = (x: number) => Math.round(x * 100) / 100
const limitar = (x: number) => Math.min(100, Math.max(0, x))

export function riesgoBaseV04(amenaza: number, vulnerabilidad: number | null): number {
  const factor = vulnerabilidad === null ? 1 : BASE_COMBINACION_V04 + (1 - BASE_COMBINACION_V04) * vulnerabilidad / 100
  return limitar(Math.round(amenaza * factor))
}

// Borde inclusivo de nivel después del redondeo entero del riesgo base.
export function vulnerabilidadEnCorte(amenaza: number, corte: number): number | null {
  if (amenaza <= 0) return null
  const v = ((corte - 0.5) / amenaza - BASE_COMBINACION_V04) / (1 - BASE_COMBINACION_V04) * 100
  return v >= 0 && v <= 100 ? v : null
}

type Componente = { nombre: string; peso: number; valor: number | null }
function dimension(componentes: Componente[]) {
  const presentes = componentes.filter((c): c is Componente & { valor: number } => c.valor !== null)
  const suma = presentes.reduce((s, c) => s + c.peso, 0)
  const pesos = presentes.map((c) => ({ ...c, peso: c.peso / suma }))
  return {
    score: suma === 0 ? null : limitar(redondear2(pesos.reduce((s, c) => s + redondear2(c.valor * c.peso), 0))),
    pesos,
  }
}

export function simularRiesgo(e: EntradaSimulador) {
  const observado = e.rio !== null && e.rio !== 'sin_dato' ? e.rio : null
  const valorRio = e.principal !== null ? limitar(100 * e.principal)
    : observado && e.alcance !== 'ninguno' ? valorAmenazaRio(observado) : null
  const lluvia = e.lluviaMm === null ? null : valorLluviaObservada(e.lluviaMm, e.horizonte === 24 ? 24 : 72, e.climatologia ?? null).valor
  const amenaza = dimension([
    { nombre: 'Peligro en celda', peso: PESOS_AMENAZA.peligroCelda, valor: e.peligro },
    { nombre: 'Caudal', peso: PESOS_AMENAZA.caudal, valor: e.caudal },
    { nombre: 'Lluvia antecedente', peso: PESOS_AMENAZA.lluviaAntecedente, valor: lluvia },
    { nombre: e.principal !== null ? 'Río probabilístico' : 'Río observado', peso: PESOS_AMENAZA.rioPrefectura, valor: valorRio },
  ])
  const h = e.historial
  const historial = h === null ? null : (
    Math.min(100, h.cantidad / HISTORIAL_TOPE_CANTIDAD * 100) +
    Math.min(100, h.horas / HISTORIAL_TOPE_DURACION_HORAS * 100) +
    Math.min(100, h.accesos / HISTORIAL_TOPE_ACCESO_INTERRUMPIDO * 100)
  ) / 3
  const vulnerabilidad = dimension([
    { nombre: 'Historial', peso: PESOS_VULNERABILIDAD.historial, valor: historial },
    { nombre: 'Susceptibilidad JRC', peso: PESOS_VULNERABILIDAD.susceptibilidad, valor: e.profundidadM === null ? null : limitar(redondear2(e.profundidadM / TOPE_PROFUNDIDAD_FLUVIAL_V04_M * 100)) },
  ])
  const pisoA = !observado || e.alcance === 'ninguno' ? null
    : e.alcance === 'completo' ? PISO_AMENAZA_POR_ESTADO_RIO[observado.estado] : PISO_AMENAZA_REDUCIDO_V04[observado.estado]
  const pisoR = !observado || e.alcance === 'ninguno' ? null
    : e.alcance === 'completo' ? PISO_RIESGO_POR_ESTADO_RIO[observado.estado] : PISO_RIESGO_REDUCIDO_V04[observado.estado]
  const pisoP = e.principal === null ? null : e.principal >= UMBRAL_P_ALTO_V04 ? PISO_RIESGO_P_ALTO_V04
    : e.conservador !== null && e.conservador >= UMBRAL_P_MODERADO_V04 ? PISO_RIESGO_P_MODERADO_V04 : null
  const A = amenaza.score === null ? null : Math.max(amenaza.score, pisoA ?? 0)
  const V = vulnerabilidad.score
  const R = A === null ? null : Math.max(riesgoBaseV04(A, V), pisoR ?? 0, pisoP ?? 0)
  const faltantes = [e.peligro, e.caudal, lluvia, historial, e.profundidadM].filter((x) => x === null).length
    + Number(e.peligro !== null && e.peligroProvisorio === true)
    + Number(e.aislamientoDisponible === false)
    + Number(e.principal === null && e.rio === 'sin_dato')
    + Number(e.principal === null && observado !== null && e.alcance !== 'ninguno' && e.exposicionIncierta === true)
  const confianza = A === null ? 'baja' : faltantes === 0 ? 'alta' : faltantes <= CONFIANZA_MEDIA_MAX_FALTANTES ? 'media' : 'baja'
  return { A, V, R, confianza, faltantes, pesos: [...amenaza.pesos.map((p) => ({ ...p, dimension: 'A' })), ...vulnerabilidad.pesos.map((p) => ({ ...p, dimension: 'V' }))] }
}
