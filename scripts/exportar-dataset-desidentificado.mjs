#!/usr/bin/env node
/**
 * Exporta un CSV de dataset desidentificado en DATA_DIR o en --out.
 * El archivo es header-only hasta que exista un constructor de filas desde la base.
 */
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { registerTsResolver } from './lib/register-ts-resolver.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
registerTsResolver(join(__dirname, '..'))
const ADVERTENCIA_SIN_FILAS =
  'sin filas: el módulo de dataset aún no tiene un constructor de filas desde la base'

function obtenerRutaSalida(args) {
  const indiceOut = args.indexOf('--out')
  if (indiceOut === -1) return undefined
  const ruta = args[indiceOut + 1]
  if (!ruta || ruta.startsWith('--')) {
    throw new Error('La opción --out requiere una ruta de archivo')
  }
  return resolve(ruta)
}

export async function exportarDatasetDesidentificado({ args = process.argv.slice(2) } = {}) {
  const { resolverSalDataset, escribirDatasetCsv } = await import(
    '../lib/infraestructura/dataset/export-desidentificado.ts'
  )
  resolverSalDataset()
  const rutaSalida = obtenerRutaSalida(args)

  // El módulo de dominio expone la serialización y escritura, pero todavía no
  // ofrece una consulta que construya features y targets desde la base.
  const filas = []
  if (filas.length === 0) console.warn(ADVERTENCIA_SIN_FILAS)
  const archivo = escribirDatasetCsv(filas, new Date(), undefined, rutaSalida)
  return {
    ok: true,
    archivo,
    filas: filas.length,
    ...(filas.length === 0 ? { advertencia: ADVERTENCIA_SIN_FILAS } : {}),
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const resultado = await exportarDatasetDesidentificado()
    console.log(JSON.stringify(resultado))
    process.exit(0)
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : 'Error desconocido al exportar el dataset'
    console.error(mensaje)
    process.exit(1)
  }
}
