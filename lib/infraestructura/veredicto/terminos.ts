// Afirmaciones prohibidas del veredicto diario (spec §8.4). Reusa la normalización
// de E8 (tildes, homoglifos, forma colapsada y forma sólo-letras) para que una
// evasión léxica no pase acá si no pasaría en E8.
//
// A diferencia de E8, algunos términos se permiten SÓLO con una ref de su fuente
// en la misma frase: "alerta"/"evacuación" requieren ref 'rio.*', y "SMN"/"aviso"
// requieren ref 'smn.*'.

import { normalizarSinTildes, validarTrazabilidadBriefing, MOTIVO_TERMINO_PROHIBIDO } from '../briefing-ia/validar'
import type { ResultadoValidacionBriefing } from '../briefing-ia/validar'
import type { MetricaAutorizada } from '../briefing-ia/metricas'
import type { FraseVeredicto } from './esquema'

const PATRON_ORDEN_OPERATIVA = /\bevacu(ar|en|e|ad)\b|\bse recomienda\b|\brecomend[a-z]*\b|\bdeben\b/
// Wording that contains digits but carries no data: time windows and the m3/s unit.
const PATRON_VENTANA_HORAS = /\b(?:24|48|72)\s*(?:h|hs|horas)\b|m3\/s/gi
const PATRON_SUSPENSION = /\bsuspend[a-z]*\b/
const PATRON_CLASES = /\bclases\b/
const PATRON_PROBABILIDAD = /\bprobabilidad[a-z]*\b/
const PATRON_CAUSAL = /\bdebido a\b|\bprovoco\b|\bcauso\b|\ba causa de\b/
const PATRON_ALERTA = /\balertas?\b/
const PATRON_EVACUACION = /\bevacuacion(es)?\b/
const PATRON_SMN = /\bsmn\b/
const PATRON_AVISO = /\bavisos?\b/

export function contieneTerminoProhibidoVeredicto(texto: string, refsDeLaFrase: string[]): boolean {
  const normalizado = normalizarSinTildes(texto)
  const colapsada = normalizado.replace(/[^a-z]+/g, ' ').trim()
  const letras = normalizado.replace(/[^a-z]/g, '')

  const tieneRef = (prefijo: string) => refsDeLaFrase.some((ref) => ref.startsWith(prefijo))

  // Always forbidden. Describing affected schools is allowed since veredicto-v3.
  if (PATRON_ORDEN_OPERATIVA.test(colapsada) || letras.includes('evacuar') || letras.includes('evacuen') || letras.includes('serecomienda') || letras.includes('recomend')) {
    return true
  }
  const tieneSuspension = PATRON_SUSPENSION.test(colapsada) || letras.includes('suspend')
  const tieneClases = PATRON_CLASES.test(colapsada) || letras.includes('clases')
  if (tieneSuspension && tieneClases) {
    return true
  }

  // Probabilidades y porcentajes: sólo con una ref de lluvia.ens.
  const mencionaProbabilidad =
    PATRON_PROBABILIDAD.test(colapsada) || letras.includes('probabilidad') || texto.includes('%')
  if (mencionaProbabilidad && !tieneRef('lluvia.ens.')) {
    return true
  }

  // Causalidad: sólo si la frase cita al menos una ref.
  const mencionaCausa = PATRON_CAUSAL.test(colapsada) || ['debidoa', 'provoco', 'causo', 'acausade'].some((t) => letras.includes(t))
  if (mencionaCausa && refsDeLaFrase.length === 0) {
    return true
  }

  // Permitidos sólo con ref de su fuente.
  const mencionaAlerta = PATRON_ALERTA.test(colapsada) || letras.includes('alerta')
  const mencionaEvacuacion = PATRON_EVACUACION.test(colapsada) || letras.includes('evacuacion')
  if ((mencionaAlerta || mencionaEvacuacion) && !tieneRef('rio.')) {
    return true
  }

  const mencionaSmnOAviso = PATRON_SMN.test(colapsada) || letras.includes('smn') || PATRON_AVISO.test(colapsada) || letras.includes('aviso')
  if (mencionaSmnOAviso && !tieneRef('smn.')) {
    return true
  }

  return false
}

// Valida un ámbito-día del veredicto. Primero revisa cada frase con sus propias
// refs (las reglas dependen de la ref, y el verificador de validarTrazabilidadBriefing
// sólo recibe el texto). Después delega en validarTrazabilidadBriefing para cifras y
// refs. Ese paso recibe un verificador que siempre responde 'no prohibido' porque
// los términos ya se revisaron arriba: así no se aplica la lista de E8 otra vez.
export function validarVeredictoAmbito(
  frases: FraseVeredicto[],
  metricas: MetricaAutorizada[],
): ResultadoValidacionBriefing {
  for (const frase of frases) {
    if (contieneTerminoProhibidoVeredicto(frase.texto, frase.refs)) {
      return { valida: false, motivo: MOTIVO_TERMINO_PROHIBIDO, frasesValidas: [] }
    }
  }

  // Time windows ("24 h") and the m3/s unit are wording, not data: drop them before tracing figures.
  const sinVentanas = frases.map((f) => ({ ...f, texto: f.texto.replace(PATRON_VENTANA_HORAS, '') }))
  return validarTrazabilidadBriefing({ frases: sinVentanas }, metricas, {
    contieneTerminoProhibido: () => false,
  })
}
