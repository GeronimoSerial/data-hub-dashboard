#!/usr/bin/env node
/** Import CGE enrollment without publishing individual/sensitive CUD counts.
 * Usage: node scripts/import-matricula-natalidad.mjs <report.xlsx>
 *   [--output public/data/natalidad/matricula.json]
 *   [--snapshot data/natalidad/matricula-cge-2021-2026.json]
 * No network or database writes; all rows validate before either output is written.
 */
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import ExcelJS from 'exceljs'
import { registerTsResolver } from './lib/register-ts-resolver.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
registerTsResolver(root, { aliases: false, absolute: false })
const { construirMatriculaNatalidad } = await import('../lib/mapas/matricula-natalidad.ts')
const usage = 'Usage: node scripts/import-matricula-natalidad.mjs <report.xlsx> [--output <file.json>] [--snapshot <file.json>]'
const args = process.argv.slice(2)
if (args.length === 1 && args[0] === '--help') {
  console.log(usage)
} else {
  try {
    const input = args.shift()
    if (!input || input.startsWith('-')) throw new Error(usage)
    const paths = { '--output': resolve(root, 'public/data/natalidad/matricula.json'), '--snapshot': resolve(root, 'data/natalidad/matricula-cge-2021-2026.json') }
    while (args.length) {
      const flag = args.shift()
      if (!(flag in paths) || !args.length) throw new Error(usage)
      paths[flag] = resolve(args.shift())
    }
    const bytes = await readFile(input)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(bytes)
    const sheet = workbook.getWorksheet('Hoja1')
    if (!sheet) throw new Error('Missing Hoja1')
    const header = ['Departamento', 'Localidad', 'Nivel Jurisdiccional', 'Cue-Anexo', 'Establecimiento', 'Nivel de Enseñanza', 'Curso', 'Ciclo Lectivo', 'Secciones con Alumnos', 'Matrícula', 'Alumnos con CUD']
    for (let i = 0; i < header.length; i++) {
      if (sheet.getRow(1).getCell(i + 1).value !== header[i]) throw new Error(`Unexpected column ${i + 1}; expected ${header[i]}`)
    }
    const filas = []
    sheet.eachRow((row, index) => {
      if (index === 1) return
      const value = (column) => row.getCell(column).value
      if (value(3) !== 'Consejo General de Educacion') throw new Error(`Unexpected jurisdiction at row ${index}`)
      filas.push({ cueAnexo: value(4), departamento: value(1), nivel: value(6), curso: value(7), anio: value(8), secciones: value(9), matricula: value(10) })
    })
    if (!filas.length) throw new Error('Empty report')
    const features = JSON.parse(await readFile(resolve(root, 'public/data/natalidad/escuelas.geojson'), 'utf8')).features
    const datos = construirMatriculaNatalidad(filas, new Set(features.map((f) => f.properties.cueAnexo)))
    const snapshot = {
      meta: { ...datos.meta, sha256: createHash('sha256').update(bytes).digest('hex') },
      columnas: ['cueAnexo', 'departamento', 'nivel', 'curso', 'anio', 'secciones', 'matricula'],
      filas: filas.map((f) => [f.cueAnexo, f.departamento, f.nivel, f.curso, f.anio, f.secciones, f.matricula]),
    }
    for (const [path, content] of [[paths['--snapshot'], snapshot], [paths['--output'], datos]]) {
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, JSON.stringify(content) + '\n')
    }
    console.log(JSON.stringify({ registros: filas.length, establecimientos: datos.meta.establecimientos, sinCoincidencia: datos.meta.cueSinCoincidencia.length, totales: Object.fromEntries(Object.entries(datos.provincia).map(([anio, valor]) => [anio, valor.matricula])) }))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
