#!/usr/bin/env node
/**
 * Importador de las capas territoriales estáticas de G1 (aislamiento OSM,
 * susceptibilidad estática physrisk, geometría OSM y exposición de ruta inundable)
 * desde los CSV/NDJSON versionados que producen los jobs offline de
 * services/geo-static/ hacia SQLite (infra_aislamiento_osm,
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
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { sql } from 'drizzle-orm'
import { z } from 'zod'

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

const fechaIsoSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha invalida: se espera formato ISO YYYY-MM-DD')

const numeroONullSchema = z.number().nullable()

/** Esquema de una fila de aislamiento ya mapeada (camelCase). Valida tipo y
 * forma: strings no vacios, numeros finitos o null (NaN queda fuera), booleano
 * o null y fechas ISO YYYY-MM-DD. */
const schemaFilaAislamiento = z.object({
  cueAnexo: z.string().min(1, 'cue_anexo no puede estar vacio'),
  versionJob: z.string().min(1, 'version_job no puede estar vacio'),
  distanciaViaPavimentadaM: numeroONullSchema,
  distanciaCabeceraDepartamentalM: numeroONullSchema,
  tramosSinPavimentarCount: numeroONullSchema,
  crucesAguaCount: numeroONullSchema,
  crucesAguaConPuenteCount: numeroONullSchema,
  crucesAguaConVadoCount: numeroONullSchema,
  tieneAlternativaSinCruce: z.boolean().nullable(),
  indiceAislamiento: numeroONullSchema,
  motivoSinDatos: z.string().nullable(),
  snapDistanciaM: numeroONullSchema,
  fechaExtractoOsm: fechaIsoSchema,
  licencia: z.string().min(1, 'licencia no puede estar vacia'),
  importadoEn: z.string(),
})

/** Esquema de una fila de susceptibilidad ya mapeada (camelCase). */
const schemaFilaSusceptibilidad = z.object({
  cueAnexo: z.string().min(1, 'cue_anexo no puede estar vacio'),
  versionJob: z.string().min(1, 'version_job no puede estar vacio'),
  peligroInundacionFluvial: numeroONullSchema,
  peligroInundacionPluvial: numeroONullSchema,
  peligroViento: numeroONullSchema,
  peligroCalor: numeroONullSchema,
  periodoRetornoAnios: z.number(),
  fuente: z.string().min(1, 'fuente no puede estar vacia'),
  fechaCorrida: fechaIsoSchema,
  licencia: z.string().min(1, 'licencia no puede estar vacia'),
  importadoEn: z.string(),
})

function formatearIssues(error) {
  return error.issues
    .map((issue) => {
      const campo = issue.path.length > 0 ? issue.path.join('.') : '(fila)'
      return `${campo}: ${issue.message}`
    })
    .join('; ')
}

export async function importarAislamiento(path, { db, tabla }) {
  const filas = leerCsv(path).map(mapearFilaAislamiento)
  let ok = 0
  let fallidas = 0
  for (const fila of filas) {
    const parseo = schemaFilaAislamiento.safeParse(fila)
    if (!parseo.success) {
      console.warn(
        `[importar-geo-static] fila invalida (${fila.cueAnexo ?? '?'}): ${formatearIssues(parseo.error)}`,
      )
      fallidas++
      continue
    }
    await db
      .insert(tabla)
      .values(parseo.data)
      .onConflictDoUpdate({ target: [tabla.cueAnexo, tabla.versionJob], set: parseo.data })
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
    const parseo = schemaFilaSusceptibilidad.safeParse(fila)
    if (!parseo.success) {
      console.warn(
        `[importar-geo-static] fila invalida (${fila.cueAnexo ?? '?'}): ${formatearIssues(parseo.error)}`,
      )
      fallidas++
      continue
    }
    await db
      .insert(tabla)
      .values(parseo.data)
      .onConflictDoUpdate({ target: [tabla.cueAnexo, tabla.versionJob], set: parseo.data })
    ok++
  }
  console.log(`[importar-geo-static] susceptibilidad: procesadas ${filas.length}, ok ${ok}, fallidas ${fallidas}`)
  return { procesadas: filas.length, ok, fallidas }
}

/** Lee un NDJSON comprimido con gzip y devuelve sus lineas no vacias (texto
 * crudo, sin parsear: una linea con JSON malformado no debe abortar el
 * archivo, se reporta como fallida en importarGeometria). */
function leerNdjsonGz(path) {
  const texto = gunzipSync(readFileSync(path)).toString('utf-8')
  return texto
    .split('\n')
    .map((linea) => linea.trim())
    .filter((linea) => linea.length > 0)
}

function mapearFilaGeometria(fila) {
  return {
    cueAnexo: fila.cue_anexo,
    versionJob: fila.version_job,
    ruta: fila.ruta,
    cruces: fila.cruces,
    motivoSinGeometria: fila.motivo_sin_geometria,
    fechaExtractoOsm: fila.fecha_extracto_osm,
    licencia: fila.licencia,
    importadoEn: new Date().toISOString(),
  }
}

const lonSchema = z.number().finite().min(-180).max(180)
const latSchema = z.number().finite().min(-90).max(90)

const rutaGeometriaSchema = z
  .object({
    type: z.literal('LineString'),
    coordinates: z.array(z.tuple([lonSchema, latSchema])).min(2),
  })
  .nullable()

const cruceGeometriaSchema = z.object({
  lon: lonSchema,
  lat: latSchema,
  clasificacion: z.enum(['puente', 'vado', 'sin_evidencia']),
})

/** Esquema de una fila de geometria ya mapeada (camelCase). Refuerza ademas la
 * regla de negocio: sin ruta (`ruta` null) el job debe declarar el motivo. */
const schemaFilaGeometria = z
  .object({
    cueAnexo: z.string().min(1, 'cue_anexo no puede estar vacio'),
    versionJob: z.string().min(1, 'version_job no puede estar vacio'),
    ruta: rutaGeometriaSchema,
    cruces: z.array(cruceGeometriaSchema),
    motivoSinGeometria: z.string().nullable(),
    fechaExtractoOsm: fechaIsoSchema,
    licencia: z.string().min(1, 'licencia no puede estar vacia'),
    importadoEn: z.string(),
  })
  .refine((fila) => fila.ruta !== null || fila.motivoSinGeometria !== null, {
    message: 'ruta null exige motivo_sin_geometria no nulo',
    path: ['motivoSinGeometria'],
  })

// Set del upsert por lote: cada fila actualiza sus columnas de datos desde la
// fila propuesta (`excluded`), no desde un unico objeto fijo, porque el lote
// lleva varias filas.
const setGeometriaExcluido = {
  ruta: sql`excluded.ruta`,
  cruces: sql`excluded.cruces`,
  motivoSinGeometria: sql`excluded.motivo_sin_geometria`,
  fechaExtractoOsm: sql`excluded.fecha_extracto_osm`,
  licencia: sql`excluded.licencia`,
  importadoEn: sql`excluded.importado_en`,
}

const TAMANO_LOTE_GEOMETRIA = 200

export async function importarGeometria(path, { db, tabla }) {
  const lineas = leerNdjsonGz(path)
  let fallidas = 0
  const validas = []
  for (const linea of lineas) {
    let cruda
    try {
      cruda = JSON.parse(linea)
    } catch {
      console.warn('[importar-geo-static] fila invalida (?): JSON malformado')
      fallidas++
      continue
    }
    if (cruda === null || typeof cruda !== 'object' || Array.isArray(cruda)) {
      console.warn('[importar-geo-static] fila invalida (?): se esperaba un objeto JSON')
      fallidas++
      continue
    }
    const parseo = schemaFilaGeometria.safeParse(mapearFilaGeometria(cruda))
    if (!parseo.success) {
      console.warn(
        `[importar-geo-static] fila invalida (${cruda.cue_anexo ?? '?'}): ${formatearIssues(parseo.error)}`,
      )
      fallidas++
      continue
    }
    validas.push(parseo.data)
  }

  for (let i = 0; i < validas.length; i += TAMANO_LOTE_GEOMETRIA) {
    const lote = validas.slice(i, i + TAMANO_LOTE_GEOMETRIA)
    await db
      .insert(tabla)
      .values(lote)
      .onConflictDoUpdate({
        target: [tabla.cueAnexo, tabla.versionJob],
        set: setGeometriaExcluido,
      })
  }

  const ok = validas.length
  console.log(`[importar-geo-static] geometria: procesadas ${lineas.length}, ok ${ok}, fallidas ${fallidas}`)
  return { procesadas: lineas.length, ok, fallidas }
}

function mapearFilaExposicionRuta(fila) {
  return {
    cueAnexo: fila.cue_anexo,
    versionJob: fila.version_job,
    estado: fila.estado,
    motivoSinDato: fila.motivo_sin_dato,
    celdasTotal: fila.celdas_total,
    celdasConDato: fila.celdas_con_dato,
    celdasConProfundidad: fila.celdas_con_profundidad,
    profundidadMaxM: fila.profundidad_max_m,
    cobertura: fila.cobertura,
    periodoRetornoAnios: fila.periodo_retorno_anios,
    resolucionArcsec: fila.resolucion_arcsec,
    escenario: fila.escenario,
    fuente: fila.fuente,
    celdas: Array.isArray(fila.celdas) ? fila.celdas.map((celda) => ({
      lon: celda?.lon,
      lat: celda?.lat,
      profundidadM: celda?.profundidad_m,
    })) : fila.celdas,
    fechaCorrida: fila.fecha_corrida,
    licencia: fila.licencia,
    importadoEn: new Date().toISOString(),
  }
}

const profundidadNoNegativaSchema = z.number().finite().min(0)
const schemaFilaExposicionRuta = z.object({
  cueAnexo: z.string().min(1),
  versionJob: z.string().min(1),
  estado: z.enum(['sin_ruta', 'sin_dato', 'sin_profundidad', 'con_profundidad']),
  motivoSinDato: z.string().nullable(),
  celdasTotal: z.number().int().min(0),
  celdasConDato: z.number().int().min(0),
  celdasConProfundidad: z.number().int().min(0),
  profundidadMaxM: profundidadNoNegativaSchema.nullable(),
  cobertura: z.number().finite().min(0).max(1),
  periodoRetornoAnios: z.number().int().min(0),
  resolucionArcsec: z.number().int().min(0),
  escenario: z.string().min(1),
  fuente: z.string().min(1),
  celdas: z.array(z.object({
    lon: z.number().finite(),
    lat: z.number().finite(),
    profundidadM: profundidadNoNegativaSchema.nullable(),
  })),
  fechaCorrida: z.string().min(1),
  licencia: z.string().min(1),
  importadoEn: z.string(),
})

const setExposicionRutaExcluido = {
  estado: sql`excluded.estado`, motivoSinDato: sql`excluded.motivo_sin_dato`,
  celdasTotal: sql`excluded.celdas_total`, celdasConDato: sql`excluded.celdas_con_dato`,
  celdasConProfundidad: sql`excluded.celdas_con_profundidad`, profundidadMaxM: sql`excluded.profundidad_max_m`,
  cobertura: sql`excluded.cobertura`, periodoRetornoAnios: sql`excluded.periodo_retorno_anios`,
  resolucionArcsec: sql`excluded.resolucion_arcsec`, escenario: sql`excluded.escenario`,
  fuente: sql`excluded.fuente`, celdas: sql`excluded.celdas`, fechaCorrida: sql`excluded.fecha_corrida`,
  licencia: sql`excluded.licencia`, importadoEn: sql`excluded.importado_en`,
}

export async function importarExposicionRuta(path, { db, tabla }) {
  const lineas = leerNdjsonGz(path)
  let fallidas = 0
  const validas = []
  for (const linea of lineas) {
    let cruda
    try { cruda = JSON.parse(linea) } catch {
      console.warn('[importar-geo-static] fila invalida (?): JSON malformado'); fallidas++; continue
    }
    if (cruda === null || typeof cruda !== 'object' || Array.isArray(cruda)) {
      console.warn('[importar-geo-static] fila invalida (?): se esperaba un objeto JSON'); fallidas++; continue
    }
    const parseo = schemaFilaExposicionRuta.safeParse(mapearFilaExposicionRuta(cruda))
    if (!parseo.success) {
      console.warn(`[importar-geo-static] fila invalida (${cruda.cue_anexo ?? '?'}): ${formatearIssues(parseo.error)}`)
      fallidas++; continue
    }
    validas.push(parseo.data)
  }
  for (let i = 0; i < validas.length; i += TAMANO_LOTE_GEOMETRIA) {
    await db.insert(tabla).values(validas.slice(i, i + TAMANO_LOTE_GEOMETRIA)).onConflictDoUpdate({
      target: [tabla.cueAnexo, tabla.versionJob], set: setExposicionRutaExcluido,
    })
  }
  const ok = validas.length
  console.log(`[importar-geo-static] exposicion-ruta: procesadas ${lineas.length}, ok ${ok}, fallidas ${fallidas}`)
  return { procesadas: lineas.length, ok, fallidas }
}

async function main() {
  const args = parsearArgs(process.argv.slice(2))
  if (!args.aislamiento && !args.susceptibilidad && !args.geometria && !args.exposicionRuta) {
    console.error(
      'Uso: node scripts/importar-geo-static.mjs --aislamiento <csv> [--susceptibilidad <csv>] [--geometria <ndjson.gz>] [--exposicion-ruta <ndjson.gz>]',
    )
    process.exit(1)
  }

  const { ensureSeeded } = await import('../lib/db/seed.ts')
  const { getDb } = await import('../lib/db/index.ts')
  const { infraAislamientoOsm, infraSusceptibilidadEstatica, infraAccesoOsmGeometria, infraExposicionRutaInundacion } =
    await import('../lib/db/schema.ts')
  await ensureSeeded()
  const db = getDb()

  if (args.aislamiento) {
    await importarAislamiento(args.aislamiento, { db, tabla: infraAislamientoOsm })
  }
  if (args.susceptibilidad) {
    await importarSusceptibilidad(args.susceptibilidad, { db, tabla: infraSusceptibilidadEstatica })
  }
  if (args.geometria) {
    await importarGeometria(args.geometria, { db, tabla: infraAccesoOsmGeometria })
  }
  if (args.exposicionRuta) {
    await importarExposicionRuta(args.exposicionRuta, { db, tabla: infraExposicionRutaInundacion })
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
