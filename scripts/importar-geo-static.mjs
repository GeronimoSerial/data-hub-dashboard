#!/usr/bin/env node
/**
 * Importador de las capas territoriales estáticas de G1 (aislamiento OSM y
 * susceptibilidad estática physrisk) desde los CSV versionados que producen
 * los jobs offline de services/geo-static/ hacia SQLite
 * (infra_aislamiento_osm, infra_susceptibilidad_estatica).
 *
 * Uso reproducible:
 *   node scripts/importar-geo-static.mjs --aislamiento <path.csv>
 *   node scripts/importar-geo-static.mjs --susceptibilidad <path.csv>
 *   node scripts/importar-geo-static.mjs --aislamiento <a.csv> --susceptibilidad <s.csv>
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { registerHooks } from 'node:module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

// Mismo hook que scripts/job-diagnostico.mjs: resuelve imports relativos a
// módulos .ts, que el resolver ESM nativo de Node no completa.
function resolveTsCandidate(base) {
  for (const candidate of [`${base}.ts`, join(base, 'index.ts')]) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) {
      const candidate = resolveTsCandidate(join(root, specifier.slice(2)))
      if (candidate) return { url: pathToFileURL(candidate).href, shortCircuit: true }
    } else if (specifier.startsWith('./') || specifier.startsWith('../')) {
      const base = join(dirname(fileURLToPath(context.parentURL)), specifier)
      const candidate = resolveTsCandidate(base)
      if (candidate) return { url: pathToFileURL(candidate).href, shortCircuit: true }
    }
    return nextResolve(specifier, context)
  },
})

function parsearArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--aislamiento') args.aislamiento = argv[++i]
    else if (argv[i] === '--susceptibilidad') args.susceptibilidad = argv[++i]
  }
  return args
}

/** Parser CSV chico: soporta comillas dobles (para 'licencia', que puede
 * llevar comas) sin depender de una librería nueva. */
function parsearLineaCsv(linea) {
  const campos = []
  let actual = ''
  let entreComillas = false
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i]
    if (c === '"') {
      entreComillas = !entreComillas
    } else if (c === ',' && !entreComillas) {
      campos.push(actual)
      actual = ''
    } else {
      actual += c
    }
  }
  campos.push(actual)
  return campos
}

function leerCsv(path) {
  const texto = readFileSync(path, 'utf-8').trim()
  const [lineaHeader, ...lineas] = texto.split(/\r?\n/)
  const header = parsearLineaCsv(lineaHeader)
  return lineas
    .filter((l) => l.length > 0)
    .map((linea) => {
      const valores = parsearLineaCsv(linea)
      const fila = {}
      header.forEach((col, i) => {
        fila[col] = valores[i] ?? ''
      })
      return fila
    })
}

const vacioANull = (v) => (v === '' || v === undefined ? null : v)
const numeroONull = (v) => (v === '' || v === undefined ? null : Number(v))
const booleanONull = (v) => (v === '' || v === undefined ? null : v === '1')

function mapearFilaAislamiento(fila) {
  return {
    cueAnexo: fila.cue_anexo,
    versionJob: fila.version_job,
    distanciaViaPavimentadaM: numeroONull(fila.distancia_via_pavimentada_m),
    distanciaCabeceraDepartamentalM: numeroONull(fila.distancia_cabecera_departamental_m),
    tramosSinPavimentarCount: numeroONull(fila.tramos_sin_pavimentar_count),
    crucesAguaCount: numeroONull(fila.cruces_agua_count),
    crucesAguaConPuenteCount: numeroONull(fila.cruces_agua_con_puente_count),
    crucesAguaConVadoCount: numeroONull(fila.cruces_agua_con_vado_count),
    tieneAlternativaSinCruce: booleanONull(fila.tiene_alternativa_sin_cruce),
    indiceAislamiento: numeroONull(fila.indice_aislamiento),
    motivoSinDatos: vacioANull(fila.motivo_sin_datos),
    snapDistanciaM: numeroONull(fila.snap_distancia_m),
    fechaExtractoOsm: fila.fecha_extracto_osm,
    licencia: fila.licencia,
    importadoEn: new Date().toISOString(),
  }
}

function mapearFilaSusceptibilidad(fila) {
  return {
    cueAnexo: fila.cue_anexo,
    versionJob: fila.version_job,
    peligroInundacionFluvial: numeroONull(fila.peligro_inundacion_fluvial),
    peligroInundacionPluvial: numeroONull(fila.peligro_inundacion_pluvial),
    peligroViento: numeroONull(fila.peligro_viento),
    peligroCalor: numeroONull(fila.peligro_calor),
    periodoRetornoAnios: numeroONull(fila.periodo_retorno_anios),
    fuente: fila.fuente,
    fechaCorrida: fila.fecha_corrida,
    licencia: fila.licencia,
    importadoEn: new Date().toISOString(),
  }
}

function validarFilaAislamiento(fila) {
  if (!fila.cueAnexo || !fila.versionJob) return 'cue_anexo/version_job faltante'
  if (!fila.fechaExtractoOsm || !fila.licencia) return 'fecha_extracto_osm/licencia faltante'
  return null
}

function validarFilaSusceptibilidad(fila) {
  if (!fila.cueAnexo || !fila.versionJob) return 'cue_anexo/version_job faltante'
  if (fila.periodoRetornoAnios === null) return 'periodo_retorno_anios faltante'
  if (!fila.fuente || !fila.fechaCorrida || !fila.licencia) return 'fuente/fecha_corrida/licencia faltante'
  return null
}

export async function importarAislamiento(path, { db, tabla }) {
  const filas = leerCsv(path).map(mapearFilaAislamiento)
  let ok = 0
  let fallidas = 0
  for (const fila of filas) {
    const error = validarFilaAislamiento(fila)
    if (error) {
      console.warn(`[importar-geo-static] fila invalida (${fila.cueAnexo ?? '?'}): ${error}`)
      fallidas++
      continue
    }
    await db
      .insert(tabla)
      .values(fila)
      .onConflictDoUpdate({ target: [tabla.cueAnexo, tabla.versionJob], set: fila })
    ok++
  }
  console.log(`[importar-geo-static] aislamiento: procesadas ${filas.length}, ok ${ok}, fallidas ${fallidas}`)
  return { procesadas: filas.length, ok, fallidas }
}

export async function importarSusceptibilidad(path, { db, tabla }) {
  const filas = leerCsv(path).map(mapearFilaSusceptibilidad)
  let ok = 0
  let fallidas = 0
  for (const fila of filas) {
    const error = validarFilaSusceptibilidad(fila)
    if (error) {
      console.warn(`[importar-geo-static] fila invalida (${fila.cueAnexo ?? '?'}): ${error}`)
      fallidas++
      continue
    }
    await db
      .insert(tabla)
      .values(fila)
      .onConflictDoUpdate({ target: [tabla.cueAnexo, tabla.versionJob], set: fila })
    ok++
  }
  console.log(`[importar-geo-static] susceptibilidad: procesadas ${filas.length}, ok ${ok}, fallidas ${fallidas}`)
  return { procesadas: filas.length, ok, fallidas }
}

async function main() {
  const args = parsearArgs(process.argv.slice(2))
  if (!args.aislamiento && !args.susceptibilidad) {
    console.error('Uso: node scripts/importar-geo-static.mjs --aislamiento <csv> [--susceptibilidad <csv>]')
    process.exit(1)
  }

  const { ensureSeeded } = await import('../lib/db/seed.ts')
  const { getDb } = await import('../lib/db/index.ts')
  const { infraAislamientoOsm, infraSusceptibilidadEstatica } = await import('../lib/db/schema.ts')
  await ensureSeeded()
  const db = getDb()

  if (args.aislamiento) {
    await importarAislamiento(args.aislamiento, { db, tabla: infraAislamientoOsm })
  }
  if (args.susceptibilidad) {
    await importarSusceptibilidad(args.susceptibilidad, { db, tabla: infraSusceptibilidadEstatica })
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
