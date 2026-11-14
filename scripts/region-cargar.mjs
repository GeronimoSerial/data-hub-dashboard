#!/usr/bin/env node
/**
 * `pnpm region:cargar <id>`: publica en la base de la región los datasets de
 * referencia declarados en config/regiones/<id>.json, campo opcional
 * `cargaDatasets: [{ clave, archivo }]`. `clave` es la clave de infra_dataset y
 * `archivo` (relativo a la raíz del repo o absoluto) es un JSON con el mismo
 * formato que `scripts/datasets-infraestructura.mjs importar`.
 *
 * Publica con guardarVersion, la operación que usa la aplicación: la versión es
 * el checksum del contenido, así que repetir la carga con el mismo contenido no
 * crea versiones nuevas.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { registerTsResolver } from './lib/register-ts-resolver.mjs'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIRECTORIO_REGIONES = join(RAIZ, 'config', 'regiones')
const CLAVE_VALIDA = /^[a-z][a-z0-9-]{1,100}$/
const USO = 'Uso: pnpm region:cargar <id> [--dry-run]'

// Error de invocación o de configuración: sale con código 2, como jobs.mjs.
export class ErrorUso extends Error {
  constructor(mensaje) {
    super(mensaje)
    this.name = 'ErrorUso'
  }
}

// ENOS_REGION_CONFIG_DIR permite apuntar a otro directorio (pruebas).
export function leerRegion(id, env = process.env) {
  if (!id) throw new ErrorUso(USO)
  if (!/^[a-z0-9-]+$/.test(id)) throw new ErrorUso(`región inválida: "${id}"`)
  const directorio = env.ENOS_REGION_CONFIG_DIR?.trim() || DIRECTORIO_REGIONES
  const archivo = join(directorio, `${id}.json`)
  if (!existsSync(archivo)) throw new ErrorUso(`región desconocida: "${id}" (no existe ${archivo})`)
  const region = JSON.parse(readFileSync(archivo, 'utf8'))
  if (region?.id !== id) throw new ErrorUso(`configuración inválida en ${id}.json: "id" no coincide`)
  return region
}

// Valida cargaDatasets antes de tocar la base. Devuelve las entradas ya leídas.
export function leerCargaDatasets(region) {
  const declarados = region.cargaDatasets ?? []
  if (!Array.isArray(declarados)) throw new ErrorUso('cargaDatasets debe ser una lista')
  const claves = new Set()
  return declarados.map((item, indice) => {
    const etiqueta = `cargaDatasets[${indice}]`
    if (!item || typeof item !== 'object') throw new ErrorUso(`${etiqueta} debe ser { clave, archivo }`)
    const { clave, archivo } = item
    if (typeof clave !== 'string' || !CLAVE_VALIDA.test(clave)) throw new ErrorUso(`${etiqueta}: clave inválida`)
    if (claves.has(clave)) throw new ErrorUso(`${etiqueta}: clave duplicada "${clave}"`)
    claves.add(clave)
    if (typeof archivo !== 'string' || !/\.(json|geojson)$/.test(archivo)) {
      throw new ErrorUso(`${etiqueta}: archivo debe ser .json o .geojson`)
    }
    const ruta = resolve(RAIZ, archivo)
    if (!existsSync(ruta)) throw new ErrorUso(`${etiqueta}: no existe ${archivo}`)
    const entrada = JSON.parse(readFileSync(ruta, 'utf8'))
    if (entrada?.datasetId !== clave) throw new ErrorUso(`${etiqueta}: datasetId de ${archivo} no es "${clave}"`)
    return { clave, archivo, entrada }
  })
}

// Publica cada entrada con la misma operación que la aplicación. Requiere la base
// configurada (DATABASE_URL en producción; PGlite en pruebas).
export async function publicarDatasets(entradas) {
  registerTsResolver(RAIZ)
  const { getDb, getRawClient, migrarDb } = await import('../lib/db/index.ts')
  const { ensureGeSchema, crearEjecutorSql } = await import('../lib/infraestructura/ge-db.ts')
  const { guardarVersion } = await import('../lib/infraestructura/datasets/repositorio.ts')
  await migrarDb()
  await ensureGeSchema(crearEjecutorSql(getRawClient()))
  const publicados = []
  for (const { clave, entrada } of entradas) {
    publicados.push({ clave, versionId: await guardarVersion(entrada, getDb()) })
  }
  return publicados
}

async function cerrarBase() {
  const { getRawClient } = await import('../lib/db/index.ts')
  const raw = getRawClient()
  if (typeof raw.end === 'function') await raw.end()
  else await raw.close()
}

// Devuelve las líneas de salida; lanza ErrorUso para los errores de invocación.
export async function main(argv = process.argv.slice(2), env = process.env) {
  const dryRun = argv.includes('--dry-run')
  const posicionales = argv.filter((arg) => arg !== '--dry-run')
  if (posicionales.length > 1 || argv.some((arg) => arg.startsWith('-') && arg !== '--dry-run')) throw new ErrorUso(USO)
  const [id] = posicionales
  const region = leerRegion(id, env)
  const entradas = leerCargaDatasets(region)
  if (!entradas.length) {
    const pendientes = region.datasetsPendientes ?? []
    return [`region ${id}: no datasets declared (pending: ${pendientes.length ? pendientes.join(', ') : 'none'})`]
  }
  if (dryRun) return entradas.map(({ clave, archivo }) => `dry-run: ${clave} <- ${archivo}`)
  if (!env.DATABASE_URL?.trim()) throw new ErrorUso('DATABASE_URL es obligatoria para publicar (usa --dry-run para listar sin base)')
  try {
    const publicados = await publicarDatasets(entradas)
    return publicados.map(({ clave, versionId }) => `dataset ${clave}: version ${versionId}`)
  } finally {
    await cerrarBase()
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    (lineas) => { for (const linea of lineas) console.log(linea) },
    (error) => {
      console.error(error instanceof ErrorUso ? error.message : `${error.code ?? 'error'}: ${String(error.message).slice(0, 1000)}`)
      process.exitCode = error instanceof ErrorUso ? 2 : 1
    },
  )
}
