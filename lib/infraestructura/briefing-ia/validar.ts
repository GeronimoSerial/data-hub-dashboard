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
export const MOTIVO_TERMINO_PROHIBIDO = 'termino_prohibido'
const MOTIVO_CUANTIFICADOR_EN_PALABRAS = 'cuantificador_en_palabras'

const PATRON_NUMERO = /\d+(?:[.,]\d+)*/g

// Homoglifos: letras de otros alfabetos (cirílico, griego) y dígitos usados
// como letras ("leetspeak") visual o casi visualmente idénticos a una letra
// latina, que un evasor puede intercalar dentro de un término prohibido sin
// cambiar cómo se lee ("alertа" con la 'а' cirílica final en vez de la 'a'
// latina). Se resuelven a su equivalente latino ANTES de buscar cualquier
// término prohibido.
const MAPA_CONFUSABLES: Record<string, string> = {
  // Cirílico visualmente indistinguible (o casi) de una letra latina.
  а: 'a',
  е: 'e',
  о: 'o',
  р: 'p',
  с: 'c',
  у: 'y',
  х: 'x',
  і: 'i',
  ѕ: 's',
  ј: 'j',
  // 'ӏ' es la palochka cirílica (U+04CF), visualmente idéntica a la 'l'
  // latina minúscula. Su capital 'Ӏ' (U+04C0) hace fold a esta forma vía
  // toLowerCase(), así que no hace falta una entrada separada.
  ӏ: 'l',
  // 'л' (El cirílica minúscula, U+043B) NO se mapea a propósito: no se parece
  // a ninguna letra latina, ni mayúscula ni minúscula. Se deja constancia
  // explícita para que no se vuelva a levantar como hallazgo.
  // 'ı' (dotless i latina/turca, U+0131) se mapea a 'l': visualmente se
  // parece más a una 'i' sin punto, pero en varias fuentes es indistinguible
  // de una 'l' minúscula, y así lo pidió la revisión.
  ı: 'l',
  // Griego visualmente similar a una letra latina.
  α: 'a',
  ο: 'o',
  ρ: 'p',
  υ: 'u',
  ι: 'i',
  ε: 'e',
  κ: 'k',
  τ: 't',
  ν: 'v',
  // Dígitos y símbolos usados como letras ("leetspeak").
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '@': 'a',
  // '|' (barra vertical, U+007C) se mapea a 'l': sin esto, las formas que
  // limpian no-letras la eliminan antes de reconstruir el término y "a|erta"
  // evade el filtro. Resolviéndola antes de esa limpieza, "a|erta" se compara
  // como "alerta".
  '|': 'l',
}

function reemplazarConfusables(texto: string): string {
  let resultado = ''
  for (const caracter of texto) {
    resultado += MAPA_CONFUSABLES[caracter] ?? caracter
  }
  return resultado
}

// Normaliza a NFKC (formas de compatibilidad Unicode: por ejemplo variantes
// de ancho completo), pasa a minúsculas, quita diacríticos (NFD + remoción de
// marcas combinantes) y por último resuelve homoglifos. El orden importa: el
// mapa de confusables está escrito en minúsculas y sin tildes, así que corre
// último.
export function normalizarSinTildes(texto: string): string {
  const base = texto
    .normalize('NFKC')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
  return reemplazarConfusables(base)
}

// A partir del texto normalizado (homoglifos resueltos, sin tildes, en
// minúsculas) se derivan dos formas y CADA término prohibido se busca en
// ambas, porque cada una atrapa una evasión distinta:
//
// (a) 'colapsada': cualquier corrida de caracteres que no sea una letra a-z
//     se colapsa a UN espacio. Conserva los límites de palabra (\b sigue
//     funcionando: "smn" no matchea dentro de "asamblea"), pero sigue
//     tratando cada palabra como una unidad separada.
// (b) 'soloLetras': se eliminan TODOS los caracteres que no sean una letra,
//     sin dejar ni un espacio ni un límite de palabra. Es la forma que
//     atrapa un término partido letra por letra o palabra por palabra
//     ("a-l-e-r-t-a", "s m n", "S.M.N." colapsan a "alerta" y "smn").
//
// (b) es agresiva a propósito y PUEDE dar falsos positivos: dos palabras
// legítimas que casualmente quedan pegadas y deletrean un término prohibido
// (ver el test 'documenta un falso positivo conocido y aceptado' en
// validar.test.ts). Ese costo se acepta deliberadamente: el resultado de un
// falso positivo acá es la plantilla determinista de E4, que es el camino
// seguro. Nunca se usa (b) para dejar pasar algo que (a) hubiera bloqueado,
// sólo para bloquear más.
function formaColapsada(normalizado: string): string {
  return normalizado.replace(/[^a-z]+/g, ' ').trim()
}

function formaSoloLetras(normalizado: string): string {
  return normalizado.replace(/[^a-z]/g, '')
}

const PATRON_ALERTA = /\balertas?\b/
const PATRON_SMN = /\bsmn\b/
const PATRON_SERVICIO_METEOROLOGICO = /servicio meteorologico/
const PATRON_EMERGENCIA_DECLARADA = /emergencia declarada/
const PATRON_EVACUACION = /\bevacu(ar|acion)\b/
const PATRON_SUSPENSION = /\bsuspension\b|\bsuspenden\b|\bsuspende\b|\bsuspendieron\b/
const PALABRAS_OFICIAL_ALERTA = ['alerta', 'alertas', 'aviso', 'advertencia']

// Exportada porque generar-briefing-asistido.ts la reusa para revalidar el
// texto final UNIDO de todas las frases (ver ese módulo): una frase puede
// partir un término prohibido a la mitad y pasar la validación por-frase de
// abajo, pero el texto reconstruido no debe colar el término igual.
export function contieneTerminoProhibido(texto: string): boolean {
  const normalizado = normalizarSinTildes(texto)
  const colapsada = formaColapsada(normalizado)
  const letras = formaSoloLetras(normalizado)

  if (
    PATRON_ALERTA.test(colapsada) ||
    PATRON_SMN.test(colapsada) ||
    PATRON_SERVICIO_METEOROLOGICO.test(colapsada) ||
    PATRON_EMERGENCIA_DECLARADA.test(colapsada) ||
    PATRON_EVACUACION.test(colapsada) ||
    letras.includes('alerta') ||
    letras.includes('smn') ||
    letras.includes('serviciometeorologico') ||
    letras.includes('emergenciadeclarada') ||
    letras.includes('evacu')
  ) {
    return true
  }

  // 'oficial' sólo se considera prohibido cuando califica una alerta/aviso:
  // aislado no aporta riesgo y prohibirlo generaría falsos positivos genéricos.
  const tieneOficial = colapsada.includes('oficial') || letras.includes('oficial')
  const tieneAlertaOAviso = PALABRAS_OFICIAL_ALERTA.some(
    (palabra) => colapsada.includes(palabra) || letras.includes(palabra),
  )
  if (tieneOficial && tieneAlertaOAviso) {
    return true
  }

  const tieneSuspension = PATRON_SUSPENSION.test(colapsada) || letras.includes('suspend')
  const tieneClases = /\bclases\b/.test(colapsada) || letras.includes('clases')
  if (tieneSuspension && tieneClases) {
    return true
  }

  return false
}

// Un cuantificador escrito en palabras ('siete escuelas', 'la mitad de las
// fuentes') evade por completo la extracción de cifras en dígitos. Prohibir
// cualquier aparición es más simple y seguro que convertir palabras a números:
// mismo criterio todo-o-nada. No se incluyen 'un'/'una' sueltas porque son
// artículos indefinidos normales y dispararían falsos positivos masivos.
const PALABRAS_CUANTIFICADOR_PROHIBIDAS = [
  'uno',
  'dos',
  'tres',
  'cuatro',
  'cinco',
  'seis',
  'siete',
  'ocho',
  'nueve',
  'diez',
  'once',
  'doce',
  'trece',
  'catorce',
  'quince',
  'dieciseis',
  'diecisiete',
  'dieciocho',
  'diecinueve',
  'veinte',
  'treinta',
  'cuarenta',
  'cincuenta',
  'sesenta',
  'setenta',
  'ochenta',
  'noventa',
  'cien',
  'ciento',
  'doscientos',
  'trescientos',
  'cuatrocientos',
  'quinientos',
  'seiscientos',
  'setecientos',
  'ochocientos',
  'novecientos',
  'mil',
  'mitad',
  'tercio',
  'tercios',
]
const PATRON_CUANTIFICADOR_EN_PALABRAS = new RegExp(
  `\\b(${PALABRAS_CUANTIFICADOR_PROHIBIDAS.join('|')})\\b`,
)
const PATRON_FRACCION_PARTE = /\b(cuarta|quinta|decima) parte\b/

function contieneCuantificadorEnPalabras(texto: string): boolean {
  const normalizado = normalizarSinTildes(texto)
  return PATRON_CUANTIFICADOR_EN_PALABRAS.test(normalizado) || PATRON_FRACCION_PARTE.test(normalizado)
}

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

export interface OpcionesValidacionBriefing {
  // Verificador de términos prohibidos. Por defecto, el de E8. Lo usa el
  // veredicto diario (E-veredicto) con su propia lista de afirmaciones.
  contieneTerminoProhibido?: (texto: string) => boolean
}

export function validarTrazabilidadBriefing(
  salida: SalidaBriefingIA,
  metricas: MetricaAutorizada[],
  opciones: OpcionesValidacionBriefing = {},
): ResultadoValidacionBriefing {
  if (salida.frases.length === 0) {
    return { valida: false, motivo: MOTIVO_SIN_FRASES, frasesValidas: [] }
  }

  const metricasPorId = mapaMetricasPorId(metricas)
  const verificarTermino = opciones.contieneTerminoProhibido ?? contieneTerminoProhibido

  for (const frase of salida.frases) {
    if (verificarTermino(frase.texto)) {
      return { valida: false, motivo: MOTIVO_TERMINO_PROHIBIDO, frasesValidas: [] }
    }

    if (contieneCuantificadorEnPalabras(frase.texto)) {
      return { valida: false, motivo: MOTIVO_CUANTIFICADOR_EN_PALABRAS, frasesValidas: [] }
    }

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
