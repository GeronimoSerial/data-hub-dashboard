import ExcelJS from 'exceljs'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HOJAS_INSTITUCIONALES = [
  'Matriculados_2026_Estatales',
  'Matriculados_2026_Privados',
]

function compararTexto(a, b) {
  return a < b ? -1 : a > b ? 1 : 0
}

export function extraerCatalogoSuperior(workbook) {
  const careersByCue = new Map()

  for (const sheetName of HOJAS_INSTITUCIONALES) {
    const sheet = workbook.getWorksheet(sheetName)
    if (!sheet) throw new Error(`Missing institutional sheet: ${sheetName}`)

    const headers = sheet.getRow(1).values
    const cueColumn = headers.indexOf('CUE')
    const careerColumn = headers.indexOf('Carrrera')
    if (cueColumn < 1 || careerColumn < 1) {
      throw new Error(`Missing CUE/career headers: ${sheetName}`)
    }

    sheet.eachRow((row, index) => {
      if (index === 1) return
      const rawCue = String(row.getCell(cueColumn).value ?? '').trim()
      if (!rawCue) return
      if (!/^\d{9}$/.test(rawCue)) throw new Error(`Invalid CUE in ${sheetName}, row ${index}`)

      const career = String(row.getCell(careerColumn).value ?? '').trim()
      if (!career) throw new Error(`Missing career in ${sheetName}, row ${index}`)

      const cue = `${rawCue.slice(0, 7)}-${rawCue.slice(7)}`
      const careers = careersByCue.get(cue) ?? new Set()
      careers.add(career)
      careersByCue.set(cue, careers)
    })
  }

  if (careersByCue.size === 0) throw new Error('No careers found')
  return Object.fromEntries(
    [...careersByCue]
      .sort(([a], [b]) => compararTexto(a, b))
      .map(([cue, careers]) => [cue, [...careers].sort(compararTexto)]),
  )
}

const source = process.argv[2]
const ejecutadoDirectamente = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (source && ejecutadoDirectamente) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(source)
  const catalog = extraerCatalogoSuperior(workbook)
  await writeFile(
    new URL('../data/carreras-superior-2026.json', import.meta.url),
    `${JSON.stringify(catalog, null, 2)}\n`,
  )
  const cueCount = Object.keys(catalog).length
  const careerCount = Object.values(catalog).reduce((total, careers) => total + careers.length, 0)
  console.log(`Imported ${cueCount} CUEs and ${careerCount} CUE-career pairs`)
} else if (!source && ejecutadoDirectamente) {
  throw new Error('Usage: node scripts/importar-carreras-superior.mjs <workbook.xlsx>')
}
