// PDF de veredictos diarios para autoridades. Lenguaje no técnico: sin percentiles,
// ids de métricas ni trazas de reglas. Las fuentes estándar de pdf-lib solo codifican
// WinAnsi, por eso todo texto pasa por sanitizarWinAnsi antes de dibujarse.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import type { DtoVeredicto } from './dto'
import type { EventoTerreno } from './eventos-terreno'
import { nombreFuente } from './metricas'
import { etiquetaNivel, nombreDepartamento } from './niveles'
import { describirAguaArriba } from './traza-texto'

export type EntradaPdfVeredictos = {
  veredictos: DtoVeredicto[]
  generadoEn: Date
  eventos?: EventoTerreno[]
}

type Color = [number, number, number]

export type LineaPdf = {
  texto: string
  negrita?: boolean
  tamano?: number
  sangria?: number
  espacioAntes?: number
  cuadrado?: Color
}

const AVISO_OFICIAL = 'No es un aviso oficial. Consulte al SMN, a Prefectura Naval y a Defensa Civil.'
const AVISO_CALIBRACION =
  'Niveles en calibración: las reglas todavía se están ajustando con eventos reales.'
const SIN_VEREDICTOS = 'Sin veredictos para el período.'

const NIVELES_CON_SENAL = new Set(['vigilancia', 'alerta', 'severo'])

const COLOR_NIVEL: Record<string, Color> = {
  sin_dato: [0.62, 0.64, 0.68],
  sin_senal: [0.45, 0.5, 0.56],
  vigilancia: [0.98, 0.8, 0.08],
  alerta: [0.98, 0.55, 0.0],
  severo: [0.86, 0.15, 0.15],
}

const TIPO_DIA: Record<string, string> = {
  observado: 'Observado',
  hoy: 'Hoy',
  pronostico: 'Pronóstico',
  pronóstico: 'Pronóstico',
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
// Reemplazos explícitos antes de codificar: comillas, guiones, símbolos y puntos suspensivos.
const REEMPLAZOS: Record<string, string> = {
  '“': '"',
  '”': '"',
  '„': '"',
  '‘': "'",
  '’': "'",
  '–': '-',
  '—': '-',
  '≥': '>=',
  '≤': '<=',
  '…': '...',
  '→': '->',
  '\t': ' ',
}

function esWinAnsi(char: string): boolean {
  const codigo = char.codePointAt(0) ?? 0
  return (codigo >= 0x20 && codigo <= 0x7e) || (codigo >= 0xa0 && codigo <= 0xff)
}

export function sanitizarWinAnsi(texto: string): string {
  return Array.from(texto, (char) => {
    if (char in REEMPLAZOS) return REEMPLAZOS[char]
    return esWinAnsi(char) ? char : '?'
  }).join('')
}

function fechaDdMmAaaa(fecha: string): string {
  const [aaaa, mm, dd] = fecha.split('-')
  return `${dd}/${mm}/${aaaa}`
}

function diaSemana(fecha: string): string {
  const [aaaa, mm, dd] = fecha.split('-').map(Number)
  return DIAS[new Date(Date.UTC(aaaa, mm - 1, dd)).getUTCDay()]
}

function encabezadoDia(fecha: string, tipoDia: string): string {
  const tipo = TIPO_DIA[tipoDia] ?? tipoDia
  const dia = diaSemana(fecha)
  return `${dia.charAt(0).toUpperCase()}${dia.slice(1)} ${fechaDdMmAaaa(fecha).slice(0, 5)} — ${tipo}`
}

function fechaEmision(generadoEn: Date): string {
  // Argentina no tiene horario de verano: UTC−3 fijo.
  const local = new Date(generadoEn.getTime() - 3 * 60 * 60 * 1000)
  const dd = String(local.getUTCDate()).padStart(2, '0')
  const mm = String(local.getUTCMonth() + 1).padStart(2, '0')
  const aaaa = local.getUTCFullYear()
  const hh = String(local.getUTCHours()).padStart(2, '0')
  const min = String(local.getUTCMinutes()).padStart(2, '0')
  return `${dd}/${mm}/${aaaa} ${hh}:${min}`
}

function primeraFrase(texto: string | null): string {
  if (!texto) return ''
  const coincidencia = texto.match(/^.*?[.!?](?=\s|$)/)
  return (coincidencia?.[0] ?? texto).trim()
}

function colorNivel(nivel: string): Color {
  return COLOR_NIVEL[nivel] ?? COLOR_NIVEL.sin_dato
}

// Parte puramente textual del PDF: sirve para probar el contenido sin dibujar.
function lineaEvento(e: EventoTerreno): string {
  const fuente = e.fuente.fecha ? `${e.fuente.medio}, ${e.fuente.fecha}` : e.fuente.medio
  // Guion simple (la fuente del PDF no tiene viñeta) y sin la URL cruda: el nombre del medio alcanza.
  return `- ${e.titulo} - ${e.lugar} (${nombreDepartamento(e.departamento)}), ${e.fechaTexto}. ${e.confianzaTexto}. Fuente: ${fuente}`
}

export function lineasPdf({ veredictos, generadoEn, eventos = [] }: EntradaPdfVeredictos): LineaPdf[] {
  const lineas: LineaPdf[] = [
    { texto: 'Veredicto diario de inundaciones — Provincia de Corrientes', negrita: true, tamano: 16 },
  ]

  const fechas = veredictos.map((v) => v.fecha).sort()
  const periodo =
    fechas.length > 0
      ? `${fechaDdMmAaaa(fechas[0])} a ${fechaDdMmAaaa(fechas[fechas.length - 1])}`
      : fechaDdMmAaaa(generadoEn.toISOString().slice(0, 10))
  lineas.push({ texto: `Período ${periodo} · emitido ${fechaEmision(generadoEn)} (hora de Argentina)`, tamano: 10 })
  lineas.push({ texto: AVISO_OFICIAL, tamano: 10, espacioAntes: 6 })

  if (veredictos.some((v) => v.enCalibracion)) {
    lineas.push({ texto: AVISO_CALIBRACION, tamano: 10 })
  }

  if (veredictos.length === 0) {
    lineas.push({ texto: SIN_VEREDICTOS, espacioAntes: 14, tamano: 11 })
    return lineas
  }

  const porFecha = new Map<string, DtoVeredicto[]>()
  for (const v of veredictos) {
    porFecha.set(v.fecha, [...(porFecha.get(v.fecha) ?? []), v])
  }

  for (const fecha of [...porFecha.keys()].sort()) {
    const delDia = porFecha.get(fecha) ?? []
    const provincia = delDia.find((v) => v.ambito === 'provincia') ?? delDia[0]
    lineas.push({
      texto: encabezadoDia(fecha, provincia.tipoDia),
      negrita: true,
      tamano: 13,
      espacioAntes: 14,
    })
    lineas.push({
      texto: `Nivel: ${etiquetaNivel(provincia.nivel)}`,
      negrita: true,
      sangria: 14,
      cuadrado: colorNivel(provincia.nivel),
    })
    if (provincia.texto) lineas.push({ texto: provincia.texto, sangria: 14 })
    const aguasArriba = provincia.aguasArriba ?? []
    if (aguasArriba.length > 0) {
      lineas.push({
        texto: `Aguas arriba (contexto, no modifica el nivel): ${aguasArriba.map(describirAguaArriba).join('; ')}`,
        sangria: 14,
      })
    }

    const departamentos = delDia.filter(
      (v) => v.ambito !== 'provincia' && NIVELES_CON_SENAL.has(v.nivel),
    )
    lineas.push({ texto: 'Departamentos con señal:', negrita: true, espacioAntes: 6, sangria: 14 })
    if (departamentos.length === 0) {
      lineas.push({ texto: 'Ninguno.', sangria: 28 })
    }
    for (const d of departamentos) {
      const frase = primeraFrase(d.texto)
      lineas.push({
        texto: `${nombreDepartamento(d.ambito)}: ${etiquetaNivel(d.nivel)}${frase ? ` — ${frase}` : ''}`,
        sangria: 28,
        cuadrado: colorNivel(d.nivel),
      })
    }

    // Los eventos confirmados son contexto: no modifican el nivel.
    const eventosDelDia = eventos.filter((e) => e.fecha === fecha)
    lineas.push({ texto: 'Confirmado en terreno (no modifica el nivel):', negrita: true, espacioAntes: 6, sangria: 14 })
    if (eventosDelDia.length === 0) {
      lineas.push({ texto: 'Sin eventos confirmados con fuente verificable.', sangria: 28 })
    }
    for (const e of eventosDelDia) {
      lineas.push({ texto: lineaEvento(e), sangria: 28 })
    }
  }

  const fuentes = new Map<string, string>()
  for (const v of veredictos) {
    for (const m of v.metricas) {
      if (!m.fuenteUrl) continue
      // Una línea por fuente (no por métrica): el registro es no técnico.
      fuentes.set(m.fuenteUrl, `${nombreFuente(m.fuenteUrl)}: ${m.fuenteUrl}`)
    }
  }
  if (fuentes.size > 0) {
    lineas.push({ texto: 'Fuentes:', negrita: true, espacioAntes: 16, tamano: 10 })
    for (const linea of fuentes.values()) lineas.push({ texto: linea, tamano: 9, sangria: 14 })
  }

  return lineas
}

function partirPalabraLarga(palabra: string, font: PDFFont, tamano: number, ancho: number): string[] {
  const partes: string[] = []
  let actual = ''
  for (const char of palabra) {
    if (font.widthOfTextAtSize(actual + char, tamano) > ancho && actual) {
      partes.push(actual)
      actual = char
    } else {
      actual += char
    }
  }
  if (actual) partes.push(actual)
  return partes
}

export function envolver(texto: string, font: PDFFont, tamano: number, ancho: number): string[] {
  const salida: string[] = []
  let linea = ''
  for (const palabra of texto.split(' ')) {
    if (font.widthOfTextAtSize(palabra, tamano) > ancho) {
      if (linea) salida.push(linea)
      const partes = partirPalabraLarga(palabra, font, tamano, ancho)
      linea = partes.pop() ?? ''
      salida.push(...partes)
      continue
    }
    const candidata = linea ? `${linea} ${palabra}` : palabra
    if (font.widthOfTextAtSize(candidata, tamano) > ancho && linea) {
      salida.push(linea)
      linea = palabra
    } else {
      linea = candidata
    }
  }
  salida.push(linea)
  return salida
}

const MARGEN = 50
const TAMANO_PAGINA: [number, number] = [595.28, 841.89]

export async function generarPdfVeredictos(entrada: EntradaPdfVeredictos): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const normal = await doc.embedFont(StandardFonts.Helvetica)
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold)
  const anchoUtil = TAMANO_PAGINA[0] - MARGEN * 2

  let pagina: PDFPage = doc.addPage(TAMANO_PAGINA)
  let y = TAMANO_PAGINA[1] - MARGEN

  for (const linea of lineasPdf(entrada)) {
    const tamano = linea.tamano ?? 11
    const font = linea.negrita ? negrita : normal
    const sangria = linea.sangria ?? 0
    const ancho = anchoUtil - sangria
    const interlineado = tamano * 1.35
    y -= linea.espacioAntes ?? 0

    for (const [indice, fragmento] of envolver(sanitizarWinAnsi(linea.texto), font, tamano, ancho).entries()) {
      if (y - interlineado < MARGEN) {
        pagina = doc.addPage(TAMANO_PAGINA)
        y = TAMANO_PAGINA[1] - MARGEN
      }
      y -= interlineado
      if (indice === 0 && linea.cuadrado) {
        pagina.drawRectangle({
          x: MARGEN + sangria - 12,
          y: y + 1,
          width: 8,
          height: 8,
          color: rgb(...linea.cuadrado),
          borderColor: rgb(0.3, 0.3, 0.3),
          borderWidth: 0.5,
        })
      }
      pagina.drawText(fragmento, { x: MARGEN + sangria, y, size: tamano, font, color: rgb(0.1, 0.1, 0.1) })
    }
  }

  return doc.save()
}
