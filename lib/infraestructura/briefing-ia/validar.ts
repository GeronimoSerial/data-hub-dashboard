// Guardrail de trazabilidad del briefing asistido por IA (E8).
// La salida del modelo se trata siempre como dato inerte: nunca se interpretan
// instrucciones embebidas en 'texto' (resistencia a prompt injection), sólo se
// extraen cifras y se contrastan contra las métricas citadas en 'refs'.
// La validación es todo-o-nada: una sola frase no trazable descarta el briefing
// completo para que el pipeline use el fallback determinista.

import { mapaMetricasPorId } from './metricas'
import type { MetricaAutorizada } from './metricas'
import type { SalidaBriefingIA } from './esquema'

export interface ResultadoValidacionBriefing {
  valida: boolean
  motivo: string | null
  frasesValidas: SalidaBriefingIA['frases']
}

const MOTIVO_SIN_FRASES = 'sin_frases'
const MOTIVO_REF_INEXISTENTE = 'ref_inexistente'
const MOTIVO_CIFRA_NO_TRAZABLE = 'cifra_no_trazable'

const PATRON_NUMERO = /\d+(?:[.,]\d+)*/g

function interpretarNumero(crudo: string): number {
  const tieneComa = crudo.includes(',')
  const tienePunto = crudo.includes('.')

  if (tieneComa && tienePunto) {
    const posicionDecimal = Math.max(crudo.lastIndexOf(','), crudo.lastIndexOf('.'))
    const entero = crudo.slice(0, posicionDecimal).replace(/[.,]/g, '')
    return Number(`${entero}.${crudo.slice(posicionDecimal + 1)}`)
  }

  if (tieneComa) {
    const partes = crudo.split(',')
    const fraccion = partes.pop() ?? ''
    return Number(`${partes.join('')}.${fraccion}`)
  }

  if (tienePunto) {
    const partes = crudo.split('.')
    // Estilo es-AR: un único punto seguido de exactamente tres dígitos es
    // separador de miles ('1.234'); en cualquier otro caso es signo decimal.
    if (partes.length > 2 || (partes[1]?.length ?? 0) === 3) {
      return Number(partes.join(''))
    }
    const fraccion = partes.pop() ?? ''
    return Number(`${partes.join('')}.${fraccion}`)
  }

  return Number(crudo)
}

function extraerNumeros(texto: string): number[] {
  const coincidencias = texto.match(PATRON_NUMERO)
  if (coincidencias === null) {
    return []
  }
  return coincidencias
    .map(interpretarNumero)
    .filter((numero) => Number.isFinite(numero))
}

function redondearADosDecimales(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100
}

function iguales(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-9
}

function valorCoincide(numero: number, metrica: MetricaAutorizada): boolean {
  return (
    iguales(numero, redondearADosDecimales(metrica.valor)) ||
    iguales(numero, Math.trunc(metrica.valor))
  )
}

export function validarTrazabilidadBriefing(
  salida: SalidaBriefingIA,
  metricas: MetricaAutorizada[],
): ResultadoValidacionBriefing {
  if (salida.frases.length === 0) {
    return { valida: false, motivo: MOTIVO_SIN_FRASES, frasesValidas: [] }
  }

  const metricasPorId = mapaMetricasPorId(metricas)

  for (const frase of salida.frases) {
    for (const ref of frase.refs) {
      if (!metricasPorId.has(ref)) {
        return { valida: false, motivo: MOTIVO_REF_INEXISTENTE, frasesValidas: [] }
      }
    }

    const numeros = extraerNumeros(frase.texto)

    if (frase.refs.length === 0) {
      if (numeros.length > 0) {
        return { valida: false, motivo: MOTIVO_CIFRA_NO_TRAZABLE, frasesValidas: [] }
      }
      continue
    }

    const citadas = frase.refs
      .map((ref) => metricasPorId.get(ref))
      .filter((metrica): metrica is MetricaAutorizada => metrica !== undefined)

    for (const numero of numeros) {
      if (!citadas.some((metrica) => valorCoincide(numero, metrica))) {
        return { valida: false, motivo: MOTIVO_CIFRA_NO_TRAZABLE, frasesValidas: [] }
      }
    }
  }

  return { valida: true, motivo: null, frasesValidas: salida.frases }
}
