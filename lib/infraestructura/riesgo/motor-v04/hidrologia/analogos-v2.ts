// Modelo temporal por estación `analogos-v2`: K vecinos más cercanos.
// Ver docs/motor-v0.4/modelo-temporal.md (sección analogos-v2).
//
// Igual que v1 en todo lo que no es la selección: sólo se lee pasado (≤ asOf),
// cada análogo d con ventana futura completa y d + largo < asOf aporta
// h0 + Δj, y las ventanas 24/72/240 h comparten miembros (P monótona).
//
// Diferencia: en lugar de exigir |h(d) − h0| ≤ tolerancia y la misma clase de
// tendencia (lo que deja sin análogos a los niveles de crecida), se ordenan los
// candidatos de la ventana estacional por
//   distancia = |h(d) − h0| + pesoTendencia·|τ(d) − τ0| + pesoEstacionalMPorDia·|doy(d) − doy0|
// (τ = h(t) − h(t − diasTendencia), todo en metros) y se toman los K primeros;
// los empates se resuelven por fecha ascendente. Sólo se abstiene si algún
// miembro elegido está a más de `distanciaMaxNivelM` en nivel.
import {
  DIAS_MAX,
  type DiagnosticoAnalogos,
  type EnsambleConjunto,
  type ResultadoAnalogos,
  type SerieDiaria,
  PARAMETROS_ANALOGOS_V1,
  distanciaEstacional,
  ensambleConjunto,
  estadoActual,
  fechaDeIndice,
  incrementos,
  recortarSerie,
  valor,
} from './analogos'

export const MODELO_TEMPORAL_VERSION_V2 = 'analogos-v2'

export type ParametrosAnalogosV2 = {
  edadMaxDias: number
  ventanaEstacionalDias: number
  diasTendencia: number
  /** Cantidad de vecinos (miembros del ensamble). */
  k: number
  /** Metros de distancia por metro de diferencia de tendencia. */
  pesoTendencia: number
  /** Metros de distancia por día de diferencia de época del año. */
  pesoEstacionalMPorDia: number
  /** Máxima |h(d) − h0| admitida entre los K elegidos. */
  distanciaMaxNivelM: number
}

// Elegidos con fechas de evaluación 1960–1989 únicamente (ver documento);
// congelados antes de evaluar 1990–2026.
export const PARAMETROS_ANALOGOS_V2: ParametrosAnalogosV2 = {
  edadMaxDias: PARAMETROS_ANALOGOS_V1.edadMaxDias,
  ventanaEstacionalDias: 30,
  diasTendencia: PARAMETROS_ANALOGOS_V1.diasTendencia,
  k: 20,
  pesoTendencia: 1,
  pesoEstacionalMPorDia: 0.005,
  distanciaMaxNivelM: 6,
}

const tendencia = (serie: SerieDiaria, i: number, dias: number) => valor(serie, i) - valor(serie, i - dias)

type Candidato = { d: number; distancia: number; distanciaNivel: number }

export function estimarAnalogosV2(serieCompleta: SerieDiaria, asOf: string, p: ParametrosAnalogosV2 = PARAMETROS_ANALOGOS_V2): ResultadoAnalogos {
  const serie = recortarSerie(serieCompleta, asOf)
  const base = { version: MODELO_TEMPORAL_VERSION_V2, asOf } as const
  const estado = estadoActual(serie, asOf, { ...PARAMETROS_ANALOGOS_V1, edadMaxDias: p.edadMaxDias, diasTendencia: p.diasTendencia })
  if (!estado) return { ...base, estado: 'no_estimable', motivo: 'nivel_actual_no_disponible', analogos: 0 }
  const largo = estado.desfaseDias + DIAS_MAX
  const doy = serie.diaDelAnio[estado.indice]
  const tau0 = tendencia(serie, estado.indice, p.diasTendencia)
  const candidatos: Candidato[] = []
  let maximoEpoca = Number.NEGATIVE_INFINITY
  for (let d = estado.indice + estado.desfaseDias - largo - 1; d >= 0; d--) {
    const dDoy = distanciaEstacional(serie.diaDelAnio[d], doy)
    if (dDoy > p.ventanaEstacionalDias) continue
    const h = serie.valores[d]
    if (Number.isNaN(h)) continue
    maximoEpoca = Math.max(maximoEpoca, h)
    // Sin tendencia actual se compara sólo nivel y época; si existe, el
    // candidato también debe tenerla.
    let dTau = 0
    if (!Number.isNaN(tau0)) {
      const tau = tendencia(serie, d, p.diasTendencia)
      if (Number.isNaN(tau)) continue
      dTau = Math.abs(tau - tau0)
    }
    if (!incrementos(serie, d, largo)) continue
    const distanciaNivel = Math.abs(h - estado.h0M)
    candidatos.push({ d, distanciaNivel, distancia: distanciaNivel + p.pesoTendencia * dTau + p.pesoEstacionalMPorDia * dDoy })
  }
  if (candidatos.length < p.k) {
    return { ...base, estado: 'no_estimable', motivo: 'analogos_insuficientes', analogos: candidatos.length }
  }
  const elegidos = candidatos.sort((a, b) => a.distancia - b.distancia || a.d - b.d).slice(0, p.k)
  const diagnostico: DiagnosticoAnalogos = {
    distanciaMaxNivelM: Math.max(...elegidos.map((c) => c.distanciaNivel)),
    fueraDeRangoHistorico: estado.h0M > maximoEpoca,
  }
  if (diagnostico.distanciaMaxNivelM > p.distanciaMaxNivelM) {
    return { ...base, estado: 'no_estimable', motivo: 'analogos_lejanos', analogos: candidatos.length }
  }
  elegidos.sort((a, b) => a.d - b.d)
  return {
    ...base,
    estado: 'estimado',
    fechaNivel: fechaDeIndice(serie.inicio + estado.indice),
    h0M: estado.h0M,
    fechasAnalogas: elegidos.map((c) => fechaDeIndice(serie.inicio + c.d)),
    trayectorias: elegidos.map((c) => (incrementos(serie, c.d, largo) as number[]).map((x) => estado.h0M + x)),
    desfaseDias: estado.desfaseDias,
    diagnostico,
  }
}

/** Ensamble conjunto con fechas elegidas por `analogos-v2` en la referencia. */
export function ensambleConjuntoV2(
  referencia: SerieDiaria,
  otras: Record<string, SerieDiaria>,
  asOf: string,
  p: ParametrosAnalogosV2 = PARAMETROS_ANALOGOS_V2,
): EnsambleConjunto {
  const pEstado = { ...PARAMETROS_ANALOGOS_V1, edadMaxDias: p.edadMaxDias, diasTendencia: p.diasTendencia }
  return ensambleConjunto(referencia, otras, asOf, pEstado, (serie, fecha) => estimarAnalogosV2(serie, fecha, p))
}
