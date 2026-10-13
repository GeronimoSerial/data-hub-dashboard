// Pure parser for the Prefectura Naval Argentina heights table
// (https://contenidosweb.prefecturanaval.gob.ar/alturas/index.php).
// No network, no database, no clock: the caller provides the HTML.

export class EstructuraPrefecturaCambiadaError extends Error {
  constructor(motivo: string) {
    super(`La estructura de la tabla de alturas de Prefectura cambió: ${motivo}`)
    this.name = 'EstructuraPrefecturaCambiadaError'
  }
}

export type FilaAlturaPrefectura = {
  puerto: string
  rio: string
  lecturaM: number | null
  variacionM: number | null
  periodoHoras: number | null
  medidaEn: string | null
  estadoPublicado: string
  lecturaAnteriorM: number | null
  medidaAnteriorEn: string | null
  alertaM: number | null
  evacuacionM: number | null
  idHistorico: number | null
  inconsistente: boolean
  motivosInconsistencia: string[]
}

// Column labels in published order. The icon column has an empty label.
const ENCABEZADOS_ESPERADOS = [
  'puerto',
  'rio',
  'ult. registro',
  'variacion',
  'periodo',
  'fecha hora',
  'estado',
  '',
  'registro anterior',
  'fecha anterior',
  'alerta',
  'evacuacion',
  'hist.',
]

// Flow stations published in m³/s, not in metres. Matched on the normalized name.
const ESTACIONES_CAUDAL = /\b(CAIXA|CAXIA|CAPANEMA|GUAYRA|ITAIPU)\b/

const SIN_DATO = new Set(['S/E', '-', ''])
const MESES: Record<string, number> = {
  ENE: 0,
  FEB: 1,
  MAR: 2,
  ABR: 3,
  MAY: 4,
  JUN: 5,
  JUL: 6,
  AGO: 7,
  SEP: 8,
  OCT: 9,
  NOV: 10,
  DIC: 11,
}
// Published dates have no zone; they are Argentina time (UTC-3).
const HORAS_ARGENTINA_A_UTC = 3
const FECHA_PUBLICADA = /^(\d{1,2})\/([A-Z]{3})\/(\d{2}) - (\d{2})(\d{2})$/
const NUMERO = /^-?\d+(\.\d+)?$/
const ENTERO = /^\d+$/

const CELDAS_ESPERADAS = ENCABEZADOS_ESPERADOS.length

function sinAcentos(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function normalizarEncabezado(texto: string): string {
  return sinAcentos(texto).toLowerCase().replace(/\s+/g, ' ').trim()
}

function textoDe(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function esSinDato(valor: string): boolean {
  return SIN_DATO.has(valor.replace(/\.$/, '').trim().toUpperCase())
}

function leerNumero(texto: string, campo: string, motivos: string[]): number | null {
  if (esSinDato(texto)) return null
  if (!NUMERO.test(texto)) {
    motivos.push(`valor_no_numerico:${campo}`)
    return null
  }
  return Number(texto)
}

function leerEntero(texto: string, campo: string, motivos: string[]): number | null {
  if (esSinDato(texto)) return null
  if (!ENTERO.test(texto)) {
    motivos.push(`valor_no_numerico:${campo}`)
    return null
  }
  return Number(texto)
}

// "13/OCT/26 - 1200" (Argentina time) -> ISO UTC string, or null when it cannot be read.
export function parsearFechaPrefectura(texto: string): string | null {
  const coincidencia = FECHA_PUBLICADA.exec(texto.trim().toUpperCase())
  if (!coincidencia) return null
  const [, diaTexto, mesTexto, anioTexto, horaTexto, minutoTexto] = coincidencia
  const mes = MESES[mesTexto ?? '']
  if (mes === undefined) return null
  const dia = Number(diaTexto)
  const anio = 2000 + Number(anioTexto)
  const hora = Number(horaTexto)
  const minuto = Number(minutoTexto)
  if (hora > 23 || minuto > 59) return null
  // Rejects impossible days such as 31/FEB.
  if (new Date(Date.UTC(anio, mes, dia)).getUTCDate() !== dia) return null
  return new Date(Date.UTC(anio, mes, dia, hora + HORAS_ARGENTINA_A_UTC, minuto)).toISOString()
}

function leerFecha(
  texto: string,
  campo: string,
  motivos: string[],
  obligatoria: boolean,
): string | null {
  if (esSinDato(texto)) {
    if (obligatoria) motivos.push(`fecha_no_interpretable:${campo}`)
    return null
  }
  const iso = parsearFechaPrefectura(texto)
  if (iso === null) motivos.push(`fecha_no_interpretable:${campo}`)
  return iso
}

function extraerTabla(html: string): string {
  const tabla = /<table\b[^>]*\bclass\s*=\s*"[^"]*\bfpTable\b[^"]*"[^>]*>([\s\S]*?)<\/table>/i.exec(html)
  if (!tabla?.[1]) throw new EstructuraPrefecturaCambiadaError('no se encontró la tabla fpTable')
  return tabla[1]
}

function verificarEncabezados(tabla: string): string {
  const thead = /<thead\b[^>]*>([\s\S]*?)<\/thead>/i.exec(tabla)
  if (!thead?.[1]) throw new EstructuraPrefecturaCambiadaError('falta el encabezado de la tabla')
  const etiquetas = [...thead[1].matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map((m) =>
    normalizarEncabezado(textoDe(m[1] ?? '')),
  )
  const coincide =
    etiquetas.length === ENCABEZADOS_ESPERADOS.length &&
    etiquetas.every((etiqueta, i) => etiqueta === ENCABEZADOS_ESPERADOS[i])
  if (!coincide) {
    throw new EstructuraPrefecturaCambiadaError(`encabezados inesperados: ${etiquetas.join(' | ')}`)
  }
  return tabla.replace(thead[0], '')
}

function celdasDe(filaHtml: string): string[] {
  return [...filaHtml.matchAll(/<(th|td)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((m) => m[2] ?? '')
}

function idHistoricoDe(celdaHtml: string): number | null {
  const id = /[?&]id=(\d+)/.exec(celdaHtml)
  return id?.[1] ? Number(id[1]) : null
}

function filaVacia(puerto: string, motivo: string): FilaAlturaPrefectura {
  return {
    puerto,
    rio: '',
    lecturaM: null,
    variacionM: null,
    periodoHoras: null,
    medidaEn: null,
    estadoPublicado: '',
    lecturaAnteriorM: null,
    medidaAnteriorEn: null,
    alertaM: null,
    evacuacionM: null,
    idHistorico: null,
    inconsistente: true,
    motivosInconsistencia: [motivo],
  }
}

function parsearFila(celdas: string[]): FilaAlturaPrefectura {
  const puerto = textoDe(celdas[0] ?? '')
  if (celdas.length !== CELDAS_ESPERADAS) return filaVacia(puerto, 'celdas_inesperadas')

  const textos = celdas.map(textoDe)
  const motivos: string[] = []
  const estado = textos[6] ?? ''

  const lecturaM = leerNumero(textos[2] ?? '', 'lecturaM', motivos)
  const variacionM = leerNumero(textos[3] ?? '', 'variacionM', motivos)
  const periodoHoras = leerEntero(textos[4] ?? '', 'periodoHoras', motivos)
  const medidaEn = leerFecha(textos[5] ?? '', 'medidaEn', motivos, true)
  const lecturaAnteriorM = leerNumero(textos[8] ?? '', 'lecturaAnteriorM', motivos)
  const medidaAnteriorEn = leerFecha(textos[9] ?? '', 'medidaAnteriorEn', motivos, false)
  const alertaM = leerNumero(textos[10] ?? '', 'alertaM', motivos)
  const evacuacionM = leerNumero(textos[11] ?? '', 'evacuacionM', motivos)

  // Simple consistency rules. Rows are marked, never dropped.
  const crece = /\bCRECE\b/.test(sinAcentos(estado).toUpperCase())
  if (lecturaM === 0 && crece) motivos.push('lectura_cero_con_crece')
  if (lecturaM === null && !esSinDato(estado)) motivos.push('sin_lectura_con_estado')
  if (lecturaM !== null && esSinDato(estado)) motivos.push('lectura_con_estado_sin_dato')

  return {
    puerto,
    rio: textos[1] ?? '',
    lecturaM,
    variacionM,
    periodoHoras,
    medidaEn,
    estadoPublicado: estado,
    lecturaAnteriorM,
    medidaAnteriorEn,
    alertaM,
    evacuacionM,
    idHistorico: idHistoricoDe(celdas[12] ?? ''),
    inconsistente: motivos.length > 0,
    motivosInconsistencia: motivos,
  }
}

/**
 * Parses the Prefectura heights table into one row per metre-based station.
 * Flow stations (m³/s) are excluded. Inconsistent rows are kept and marked.
 * Throws EstructuraPrefecturaCambiadaError when the table or its headers are missing.
 */
export function parsearAlturasPrefectura(html: string): FilaAlturaPrefectura[] {
  const cuerpo = verificarEncabezados(extraerTabla(html))
  const filas: FilaAlturaPrefectura[] = []

  for (const [, filaHtml] of cuerpo.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const celdas = celdasDe(filaHtml ?? '')
    if (celdas.length === 0) continue
    const puerto = textoDe(celdas[0] ?? '')
    if (ESTACIONES_CAUDAL.test(sinAcentos(puerto).toUpperCase())) continue
    filas.push(parsearFila(celdas))
  }

  return filas
}
