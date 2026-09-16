#!/usr/bin/env node
/**
 * Sincroniza localizaciones (ge_localizacion) desde public/data/localizaciones.json +
 * establishments.geojson y arma un corte sintético de prueba (fixture) en ge.sqlite.
 * Usage: node scripts/sync-ge.mjs --fixture
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { registerHooks } from 'node:module'
import { normalizeCue } from '../lib/infraestructura/cue.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

// lib/infraestructura/ge-db.ts importa '@libsql/client' y '@/lib/data-dir'. El alias @/
// lo mapea Node vía tsconfig, pero deja la ruta sin extensión ('../data-dir'), que el
// resolver ESM no completa. Registramos un hook que agrega '.ts' antes de importar.
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
    } else if (specifier.startsWith('./') || specifier.startsWith('../') || specifier.startsWith('/')) {
      const base = specifier.startsWith('/')
        ? specifier
        : join(dirname(fileURLToPath(context.parentURL)), specifier)
      const candidate = resolveTsCandidate(base)
      if (candidate) return { url: pathToFileURL(candidate).href, shortCircuit: true }
    }
    return nextResolve(specifier, context)
  },
})

const { openGeDb, ensureGeSchema, activarCorte } = await import(
  '../lib/infraestructura/ge-db.ts'
)

export function parseLocalizacionesJson(jsonText) {
  let data
  try {
    data = JSON.parse(jsonText)
  } catch {
    return { registros: [], descartados: [] }
  }
  if (!Array.isArray(data)) return { registros: [], descartados: [] }

  const descartados = []
  const registros = []
  for (const obj of data) {
    const parsed = normalizeCue(obj.cueAnexo)
    if (parsed === null || parsed.kind !== 'anexo') {
      descartados.push(obj.cueAnexo)
      continue
    }
    registros.push({
      cueAnexo: parsed.value,
      cui: null,
      nombre: obj.nombre,
      departamento: obj.departamento,
      localidad: obj.localidad,
      lat: typeof obj.lat === 'number' ? obj.lat : null,
      lon: typeof obj.lon === 'number' ? obj.lon : null,
      geoCalidad: typeof obj.geoCalidad === 'string' ? obj.geoCalidad : null,
    })
  }
  return { registros, descartados }
}

export function parseGeojsonLocalizaciones(geojsonText) {
  const geojson = JSON.parse(geojsonText)
  const features = Array.isArray(geojson.features) ? geojson.features : []

  const descartados = []
  const registros = []
  for (const feature of features) {
    const props = feature.properties ?? {}
    const parsed = normalizeCue(props.cue)
    if (parsed === null || parsed.kind !== 'anexo') {
      descartados.push(props.cue)
      continue
    }
    const coordinates = feature.geometry?.coordinates ?? []
    registros.push({
      cueAnexo: parsed.value,
      cui: null,
      nombre: props.name,
      departamento: props.department,
      localidad: props.locality,
      lat: coordinates[1],
      lon: coordinates[0],
      geoCalidad: null,
    })
  }
  return { registros, descartados }
}

export function reconciliarLocalizaciones(indexHtmlResult, geojsonResult) {
  const porCueAnexo = new Map(indexHtmlResult.registros.map((r) => [r.cueAnexo, r]))

  for (const geo of geojsonResult.registros) {
    const existente = porCueAnexo.get(geo.cueAnexo)
    if (existente) {
      existente.nombre = geo.nombre
      existente.departamento = geo.departamento
      existente.localidad = geo.localidad
      existente.lat = geo.lat
      existente.lon = geo.lon
    } else {
      porCueAnexo.set(geo.cueAnexo, { ...geo })
    }
  }

  return {
    registros: [...porCueAnexo.values()],
    descartados: [...indexHtmlResult.descartados, ...geojsonResult.descartados],
  }
}

const UPSERT_LOCALIZACION_SQL = `INSERT INTO ge_localizacion (cue_anexo, cui, nombre, departamento, localidad, lat, lon, geo_calidad) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(cue_anexo) DO UPDATE SET cui=excluded.cui, nombre=excluded.nombre, departamento=excluded.departamento, localidad=excluded.localidad, lat=excluded.lat, lon=excluded.lon, geo_calidad=excluded.geo_calidad`

export async function upsertLocalizaciones(client, registros) {
  for (const r of registros) {
    await client.execute({
      sql: UPSERT_LOCALIZACION_SQL,
      args: [
        r.cueAnexo,
        r.cui,
        r.nombre,
        r.departamento,
        r.localidad,
        r.lat,
        r.lon,
        r.geoCalidad,
      ],
    })
  }
}

export function buildFixtureSecciones(corteId, cuesDisponibles) {
  const X = cuesDisponibles[0] ?? '1234567-00'
  const Y = cuesDisponibles[1] ?? X
  return {
    secciones: [
      { corteId, geSectionId: 1, cueAnexo: X, curso: 'Sala 5', division: 'A', nivel: 'Inicial', turno: 'Mañana' },
      { corteId, geSectionId: 2, cueAnexo: X, curso: '1', division: 'A', nivel: 'Primario', turno: 'Mañana' },
      { corteId, geSectionId: 3, cueAnexo: Y, curso: '2', division: 'B', nivel: 'Primario', turno: 'Tarde' },
    ],
    membresias: [
      { corteId, geSectionId: 1, gePersonId: 1001 },
      { corteId, geSectionId: 1, gePersonId: 1002 },
      { corteId, geSectionId: 2, gePersonId: 1002 },
      { corteId, geSectionId: 3, gePersonId: 1003 },
    ],
  }
}

export async function insertFixtureCorte(client, cuesDisponibles) {
  const res = await client.execute({
    sql: "INSERT INTO ge_corte (ciclo_lectivo, fetched_at, estado) VALUES (2026, ?, 'importando')",
    args: [new Date().toISOString()],
  })
  const corteId = Number(res.lastInsertRowid)

  const { secciones, membresias } = buildFixtureSecciones(corteId, cuesDisponibles)

  for (const s of secciones) {
    await client.execute({
      sql: 'INSERT INTO ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (?,?,?,?,?,?,?)',
      args: [s.corteId, s.geSectionId, s.cueAnexo, s.curso, s.division, s.nivel, s.turno],
    })
  }
  for (const m of membresias) {
    await client.execute({
      sql: 'INSERT INTO ge_alumno_seccion (corte_id, ge_section_id, ge_person_id) VALUES (?,?,?)',
      args: [m.corteId, m.geSectionId, m.gePersonId],
    })
  }

  await activarCorte(client, corteId)
  return corteId
}

async function runFixture() {
  const client = openGeDb()
  try {
    await ensureGeSchema(client)

    const localizacionesJsonPath = join(root, 'public', 'data', 'localizaciones.json')
    let localizacionesResult = { registros: [], descartados: [] }
    if (existsSync(localizacionesJsonPath)) {
      localizacionesResult = parseLocalizacionesJson(readFileSync(localizacionesJsonPath, 'utf8'))
    } else {
      console.warn('localizaciones.json no encontrado, localizaciones del fixture seran minimas')
    }

    const geojsonPath = join(root, 'public', 'data', 'establishments.geojson')
    let geojsonResult = { registros: [], descartados: [] }
    if (existsSync(geojsonPath)) {
      geojsonResult = parseGeojsonLocalizaciones(readFileSync(geojsonPath, 'utf8'))
    } else {
      console.warn('establishments.geojson no encontrado, localizaciones del fixture seran minimas')
    }

    const { registros, descartados } = reconciliarLocalizaciones(localizacionesResult, geojsonResult)
    await upsertLocalizaciones(client, registros)

    const cuesDisponibles = registros.map((r) => r.cueAnexo)
    const corteId = await insertFixtureCorte(client, cuesDisponibles)

    const sinCoordenadas = registros.filter((r) => r.lat == null || r.lon == null).length
    const sinCui = registros.filter((r) => r.cui == null).length

    console.log(`Localizaciones cargadas: ${registros.length}`)
    console.log(
      `Descartados: ${descartados.length}${descartados.length > 0 && descartados.length <= 20 ? ` -> ${descartados.join(', ')}` : ''}`,
    )
    console.log(`Sin lat/lon: ${sinCoordenadas}`)
    console.log(`Sin cui: ${sinCui}`)
    console.log(`Corte activado: ${corteId}`)
  } finally {
    client.close()
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--fixture')) {
    await runFixture()
  }
}