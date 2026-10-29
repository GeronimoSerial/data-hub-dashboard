#!/usr/bin/env node
/**
 * Importa las planillas "Servicios de Comidas" del MEC (xlsx) a
 * infra_comedor_escuela: por escuela, si brinda desayuno y/o almuerzo.
 *
 * Uso:
 *   node scripts/importar-comedores.mjs <planilla1.xlsx> [<planilla2.xlsx> ...] [--dry-run]
 *
 * - Hoja PlanillaServicioComedor, encabezado en la fila 3, datos desde la fila 4;
 *   las columnas se leen por nombre ("Cue-Anexo", "Proveedor", "Raciones Desayuno",
 *   "Raciones Almuerzo").
 * - Servicio = raciones > 0. Un CUE repetido (en un archivo o entre archivos) suma
 *   raciones; no hay filas por archivo.
 * - Reemplaza TODA la tabla en una transacción. Necesita DATABASE_URL (salvo
 *   --dry-run, que sólo lee los archivos e imprime el resumen y las filas rechazadas).
 * - Los xlsx no se versionan en el repo.
 */
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import ExcelJS from 'exceljs'

import { registerTsResolver } from './lib/register-ts-resolver.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
registerTsResolver(root)

export async function leerArchivos(rutas) {
  const { leerPlanillaComedores, agregarComedores } = await import('../lib/infraestructura/comedores/importar.ts')
  const filas = []
  const rechazadas = []
  for (const ruta of rutas) {
    const libro = new ExcelJS.Workbook()
    await libro.xlsx.readFile(ruta)
    const leido = leerPlanillaComedores(libro, basename(ruta))
    filas.push(...leido.filas)
    rechazadas.push(...leido.rechazadas)
  }
  return { ...agregarComedores(filas), rechazadas }
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const rutas = args.filter((a) => !a.startsWith('--'))
  if (rutas.length === 0) {
    console.error('Uso: node scripts/importar-comedores.mjs <planilla.xlsx> [...] [--dry-run]')
    process.exit(2)
  }

  const { comedores, estadisticas, rechazadas } = await leerArchivos(rutas)
  const resumen = {
    ...estadisticas,
    conServicio: comedores.length,
    desayunoYAlmuerzo: comedores.filter((c) => c.desayuno && c.almuerzo).length,
    soloDesayuno: comedores.filter((c) => c.desayuno && !c.almuerzo).length,
    soloAlmuerzo: comedores.filter((c) => !c.desayuno && c.almuerzo).length,
    rechazadas: rechazadas.length,
  }
  console.log(JSON.stringify(resumen, null, 2))
  for (const r of rechazadas) console.warn(`[importar-comedores] fila rechazada ${r.fuente}:${r.fila} (${r.motivo}) cue=${r.cue ?? '-'}`)

  if (dryRun) {
    console.log('[importar-comedores] --dry-run: no se escribió nada')
    return
  }
  if (!process.env.DATABASE_URL) {
    console.error('Falta DATABASE_URL (usá --dry-run para sólo validar los archivos)')
    process.exit(1)
  }
  const { migrarDb, getRawClient } = await import('../lib/db/index.ts')
  const { reemplazarComedores } = await import('../lib/infraestructura/comedores/repositorio.ts')
  try {
    await migrarDb()
    const { insertados } = await reemplazarComedores(comedores, { fuente: rutas.map((r) => basename(r)).join(', ') })
    console.log(`[importar-comedores] insertados: ${insertados}`)
  } finally {
    const raw = getRawClient()
    if (typeof raw.end === 'function') await raw.end()
    else await raw.close()
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
