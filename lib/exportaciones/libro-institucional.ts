import { readFile } from 'node:fs/promises'
import path from 'node:path'
import ExcelJS from 'exceljs'

const FUENTE = 'Arial'
const COLOR_TEXTO = 'FF2E2D2C'
const COLOR_ENCABEZADO = 'FF1F5D9B'
const COLOR_BLANCO = 'FFFFFFFF'
const COLOR_BORDE = 'FFE0DFDE'
const COLOR_ZEBRA = 'FFF5F5F4'
const COLOR_ACENTO = 'FFFACD05'
const ZONA_HORARIA = 'America/Argentina/Buenos_Aires'
const LADO_LOGO_PX = 56
const ANCHO_MINIMO_COLUMNA_LOGO = 12
const COLUMNA_TEXTO = 2
const ARCHIVO_ESCUDO = path.join(process.cwd(), 'public', 'marca', 'escudo.png')

export type FormatoColumna = 'texto' | 'entero' | 'numero' | 'fecha'

export type ColumnaLibro = {
  clave: string
  encabezado: string
  ancho?: number
  formato?: FormatoColumna
}

export type FiltroLibro = { etiqueta: string; valor: string }

export type OpcionesLibroInstitucional = {
  titulo: string
  subtitulo?: string
  filtros: FiltroLibro[]
  columnas: ColumnaLibro[]
  filas: Record<string, unknown>[]
  generadoEn: Date
  hoja?: string
  unidad?: string
}

const FORMATO_NUMERICO: Record<FormatoColumna, string | undefined> = {
  texto: undefined,
  entero: '#,##0',
  numero: '#,##0.00',
  fecha: 'dd/mm/yyyy',
}

function fuente(extra: Partial<ExcelJS.Font> = {}): Partial<ExcelJS.Font> {
  return { name: FUENTE, size: 10, color: { argb: COLOR_TEXTO }, ...extra }
}

function formatearFechaHora(fecha: Date): string {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: ZONA_HORARIA,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(fecha)
      .map((parte) => [parte.type, parte.value]),
  )
  return `${partes.day}/${partes.month}/${partes.year} ${partes.hour}:${partes.minute}`
}

function nombreHoja(hoja: string | undefined): string {
  return (hoja ?? 'Listado').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31)
}

function valorCelda(valor: unknown): ExcelJS.CellValue {
  if (valor == null || valor === '') return null
  if (valor instanceof Date || typeof valor === 'number' || typeof valor === 'string' || typeof valor === 'boolean') {
    return valor
  }
  return String(valor)
}

const borde: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: COLOR_BORDE } },
  left: { style: 'thin', color: { argb: COLOR_BORDE } },
  bottom: { style: 'thin', color: { argb: COLOR_BORDE } },
  right: { style: 'thin', color: { argb: COLOR_BORDE } },
}

function rellenoSolido(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } }
}

export async function crearLibroInstitucional(opciones: OpcionesLibroInstitucional): Promise<ArrayBuffer> {
  const { titulo, subtitulo, filtros, columnas, filas, generadoEn, hoja, unidad = 'registros' } = opciones
  const cantidadColumnas = Math.max(columnas.length, 1)

  const wb = new ExcelJS.Workbook()
  wb.created = generadoEn
  const ws = wb.addWorksheet(nombreHoja(hoja))

  // Top block: logo in column A, text from column B.
  ws.getRow(1).height = 30
  const celdaTitulo = ws.getCell(1, COLUMNA_TEXTO)
  celdaTitulo.value = titulo
  celdaTitulo.font = fuente({ size: 16, bold: true })

  ws.getCell(2, COLUMNA_TEXTO).value = subtitulo ?? null
  ws.getCell(2, COLUMNA_TEXTO).font = fuente({ size: 11 })

  ws.getCell(3, COLUMNA_TEXTO).value = `Generado: ${formatearFechaHora(generadoEn)}`
  ws.getCell(3, COLUMNA_TEXTO).font = fuente({ size: 9 })

  filtros.forEach((filtro, indice) => {
    const celda = ws.getCell(4 + indice, COLUMNA_TEXTO)
    celda.value = `${filtro.etiqueta}: ${filtro.valor}`
    celda.font = fuente()
  })

  const filaInicioTabla = 3 + filtros.length
  const filaAcento = filaInicioTabla + 2
  const filaEncabezado = filaAcento + 1
  const ultimaFilaDatos = filaEncabezado + filas.length
  const filaTotal = ultimaFilaDatos + 2

  ws.getRow(filaAcento).height = 5
  for (let col = 1; col <= cantidadColumnas; col++) {
    ws.getCell(filaAcento, col).fill = rellenoSolido(COLOR_ACENTO)
  }

  // Header row.
  ws.getRow(filaEncabezado).height = 24
  columnas.forEach((columna, indice) => {
    const celda = ws.getCell(filaEncabezado, indice + 1)
    celda.value = columna.encabezado
    celda.font = fuente({ bold: true, color: { argb: COLOR_BLANCO } })
    celda.fill = rellenoSolido(COLOR_ENCABEZADO)
    celda.alignment = { vertical: 'middle', horizontal: indice === 0 ? 'left' : 'center', wrapText: true }
    celda.border = borde
  })

  // Data rows with zebra striping.
  filas.forEach((fila, indiceFila) => {
    const numeroFila = filaEncabezado + 1 + indiceFila
    columnas.forEach((columna, indice) => {
      const formato = columna.formato ?? 'texto'
      const celda = ws.getCell(numeroFila, indice + 1)
      celda.value = valorCelda(fila[columna.clave])
      celda.font = fuente()
      celda.border = borde
      const numFmt = FORMATO_NUMERICO[formato]
      if (numFmt) celda.numFmt = numFmt
      celda.alignment = {
        vertical: 'middle',
        horizontal: formato === 'texto' ? 'left' : 'right',
      }
      if (indiceFila % 2 === 1) celda.fill = rellenoSolido(COLOR_ZEBRA)
    })
  })

  ws.getCell(filaTotal, 1).value = `Total: ${filas.length} ${unidad}`
  ws.getCell(filaTotal, 1).font = fuente({ bold: true })

  // Column widths: the first column also hosts the logo, so keep it wide enough.
  columnas.forEach((columna, indice) => {
    const ancho = columna.ancho ?? 16
    ws.getColumn(indice + 1).width = indice === 0 ? Math.max(ancho, ANCHO_MINIMO_COLUMNA_LOGO) : ancho
  })

  ws.autoFilter = {
    from: { row: filaEncabezado, column: 1 },
    to: { row: Math.max(ultimaFilaDatos, filaEncabezado), column: cantidadColumnas },
  }

  ws.views = [
    {
      state: 'frozen',
      xSplit: 0,
      ySplit: filaEncabezado,
      topLeftCell: `A${filaEncabezado + 1}`,
      activeCell: `A${filaEncabezado + 1}`,
    },
  ]

  ws.pageSetup = {
    orientation: 'landscape',
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printTitlesRow: `${filaEncabezado}:${filaEncabezado}`,
  }

  // exceljs declares its buffers against a global `Buffer` that Node's Buffer does not satisfy.
  const escudo = (await readFile(ARCHIVO_ESCUDO)) as unknown as ExcelJS.Image['buffer']
  const idEscudo = wb.addImage({ buffer: escudo, extension: 'png' })
  ws.addImage(idEscudo, {
    tl: { col: 0.1, row: 0.1 },
    ext: { width: LADO_LOGO_PX, height: LADO_LOGO_PX },
  })

  const salida = await wb.xlsx.writeBuffer()
  return salida
}
