#!/usr/bin/env node
/**
 * Importador de las capas territoriales estáticas de G1 (aislamiento OSM,
 * susceptibilidad estática physrisk, geometría OSM y exposición de ruta inundable)
 * desde los CSV/NDJSON versionados que producen los jobs offline de
 * services/geo-static/ hacia Postgres o PGlite con Drizzle (infra_aislamiento_osm,
 * infra_susceptibilidad_estatica, infra_acceso_osm_geometria,
 * infra_exposicion_ruta_inundacion).
 *
 * Uso reproducible:
 *   node scripts/importar-geo-static.mjs --aislamiento <path.csv>
 *   node scripts/importar-geo-static.mjs --susceptibilidad <path.csv>
 *   node scripts/importar-geo-static.mjs --geometria <path.ndjson.gz>
 *   node scripts/importar-geo-static.mjs --exposicion-ruta <path.ndjson.gz>
 *   node scripts/importar-geo-static.mjs --aislamiento <a.csv> --susceptibilidad <s.csv>
 *   node scripts/importar-geo-static.mjs --aislamiento <a.csv> --geometria <g.ndjson.gz>
 *   node scripts/importar-geo-static.mjs --inundacion-v2 <inundacion_v2.csv> --exposicion-ruta-v2 <ruta_v2.ndjson.gz>
 * Las capas v2 solo actualizan sus columnas v2 en filas existentes (por cue_anexo);
 * no tocan las columnas v1.
 * Si no se indican opciones, importa los archivos reconocidos en
 * GEO_STATIC_OUTPUT_DIR (por defecto services/geo-static/output junto al repo/script).
 */
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { registerTsResolver } from './lib/register-ts-resolver.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

// Mismo hook que scripts/job-diagnostico.mjs: resuelve imports relativos a
// módulos .ts, que el resolver ESM nativo de Node no completa.
registerTsResolver(root, { absolute: false })

function parsearArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--aislamiento') args.aislamiento = argv[++i]
    else if (argv[i] === '--susceptibilidad') args.susceptibilidad = argv[++i]
    else if (argv[i] === '--geometria') args.geometria = argv[++i]
    else if (argv[i] === '--exposicion-ruta') args.exposicionRuta = argv[++i]
    else if (argv[i] === '--inundacion-v2') args.inundacionV2 = argv[++i]
    else if (argv[i] === '--exposicion-ruta-v2') args.exposicionRutaV2 = argv[++i]
  }
  return args
}

/**
 * @typedef {{ aislamiento?: string, susceptibilidad?: string, geometria?: string, exposicionRuta?: string, inundacionV2?: string, exposicionRutaV2?: string }} ArchivosGeoStatic
 */

/**
 * Encuentra el archivo de versión lexicográficamente más reciente por capa.
 * @param {string[]} archivos
 * @param {string} dir
 * @returns {ArchivosGeoStatic}
 */
export function descubrirArchivosGeoStatic(archivos, dir) {
  const ultimoQueCoincide = (patron) => archivos.filter((archivo) => patron.test(archivo)).sort().at(-1)
  const aislamiento = ultimoQueCoincide(/^aislamiento_osm-v.*\.csv$/)
  const susceptibilidad = ultimoQueCoincide(/^susceptibilidad_estatica-v.*\.csv$/)
  const geometria = ultimoQueCoincide(/^accesos_osm_geometria-v.*\.ndjson\.gz$/)
  // v1 y v2 de ruta comparten prefijo: cada kind filtra su propia versión para que
  // el más reciente lexicográfico de v2 no se importe como v1 (o al revés).
  const exposicionRuta = ultimoQueCoincide(/^exposicion_ruta_inundacion-v1-.*\.ndjson\.gz$/)
  const inundacionV2 = ultimoQueCoincide(/^inundacion_v2-v.*\.csv$/)
  const exposicionRutaV2 = ultimoQueCoincide(/^exposicion_ruta_inundacion-v2-.*\.ndjson\.gz$/)

  return {
    ...(aislamiento ? { aislamiento: join(dir, aislamiento) } : {}),
    ...(susceptibilidad ? { susceptibilidad: join(dir, susceptibilidad) } : {}),
    ...(geometria ? { geometria: join(dir, geometria) } : {}),
    ...(exposicionRuta ? { exposicionRuta: join(dir, exposicionRuta) } : {}),
    ...(inundacionV2 ? { inundacionV2: join(dir, inundacionV2) } : {}),
    ...(exposicionRutaV2 ? { exposicionRutaV2: join(dir, exposicionRutaV2) } : {}),
  }
}


export { importarAislamiento, importarSusceptibilidad, importarGeometria, importarExposicionRuta, importarInundacionV2, importarExposicionRutaV2 } from '../lib/infraestructura/datasets/geo-static-contratos.mjs'

async function main() {
  const args = parsearArgs(process.argv.slice(2))
  const hayArchivos = (a) => Boolean(
    a.aislamiento || a.susceptibilidad || a.geometria || a.exposicionRuta || a.inundacionV2 || a.exposicionRutaV2,
  )
  if (!hayArchivos(args)) {
    console.error(
      'Uso: node scripts/importar-geo-static.mjs --aislamiento <csv> [--susceptibilidad <csv>] [--geometria <ndjson.gz>] [--exposicion-ruta <ndjson.gz>] [--inundacion-v2 <csv>] [--exposicion-ruta-v2 <ndjson.gz>]',
    )
    process.exit(1)
  }

  const { migrarDb } = await import('../lib/db/index.ts')
  const { ingestarGeo } = await import('../lib/infraestructura/datasets/geo-static.ts')
  const { leerCsvGeo, leerNdjsonGeo } = await import('../lib/infraestructura/datasets/geo-static-contratos.mjs')
  await migrarDb()
  for (const [argumento, tipo] of Object.entries({ aislamiento: 'aislamiento', susceptibilidad: 'susceptibilidad',
    geometria: 'geometria', exposicionRuta: 'exposicion-ruta', inundacionV2: 'inundacion-v2', exposicionRutaV2: 'exposicion-ruta-v2' })) {
    if (!args[argumento]) continue
    const path = args[argumento]
    const filas = path.endsWith('.csv') ? leerCsvGeo(path) : leerNdjsonGeo(path).map((linea) => JSON.parse(linea))
    const versionId = await ingestarGeo(tipo, filas, { revision: path.split('/').at(-1), fuente: 'Importación histórica explícita',
      entradas: [], metadatos: { entradasOriginalesNoDocumentadas: true } })
    console.log(JSON.stringify({ tipo, versionId, filas: filas.length }))
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then(async () => {
      const { getRawClient } = await import('../lib/db/index.ts')
      const client = getRawClient()
      if (typeof client.close === 'function') await client.close()
      else await client.end()
      process.exit(0)
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error)
      process.exit(1)
    })
}
