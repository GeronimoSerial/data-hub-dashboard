#!/usr/bin/env node
// Curation-time gazetteer for the reported flood events registry.
//
// Reads the published registry, resolves names with Nominatim and publishes
// a new gazetteer version in the DB. The app never calls
// Nominatim at runtime; rerun this script when the registry changes.
//
// Nominatim usage policy: at most 1 request per second, descriptive User-Agent,
// results cached in the published dataset. Data © OpenStreetMap contributors (ODbL).

import { registerTsResolver } from './lib/register-ts-resolver.mjs'
registerTsResolver(process.cwd())
const { getRawClient } = await import('../lib/db/index.ts')
const { leerVersion, guardarVersion } = await import('../lib/infraestructura/datasets/repositorio.ts')
const NOMINATIM = 'https://nominatim.openstreetmap.org/search'
const USER_AGENT = 'data-hub-dashboard gazetteer curation (https://github.com/GeronimoSerial/data-hub-dashboard)'
const PAUSA_MS = 1100

// Search text per place when the registry name alone is ambiguous in OSM.


// OSM classes accepted as a named place (towns, islands, parajes, barrios, dams).
const ACEPTADOS = [
  ['place', ['city', 'town', 'village', 'hamlet', 'island', 'islet', 'locality', 'isolated_dwelling', 'neighbourhood', 'suburb', 'quarter']],
  ['boundary', ['administrative']],
  ['waterway', ['dam']],
  ['man_made', ['dam']],
]

const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms))

function aceptado(resultado) {
  return ACEPTADOS.some(([clase, tipos]) => resultado.category === clase && tipos.includes(resultado.type))
}

async function buscar(texto) {
  const url = new URL(NOMINATIM)
  url.search = new URLSearchParams({
    q: `${texto}, Corrientes, Argentina`,
    format: 'jsonv2',
    countrycodes: 'ar',
    limit: '5',
  }).toString()
  const respuesta = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'es' } })
  if (!respuesta.ok) throw new Error(`Nominatim HTTP ${respuesta.status}`)
  const resultados = await respuesta.json()
  return resultados.find(aceptado) ?? null
}

try {
const versionRegistro = await leerVersion('eventos-inundaciones')
if (!versionRegistro) throw new Error('Registro de eventos sin publicar')
const registro = versionRegistro.documento
const anterior = await leerVersion('gazetteer-osm')
const cache = new Map((anterior?.documento.lugares ?? []).map((lugar) => [lugar.nombre, lugar]))
const nombres = [
  ...new Set(
    registro.features.flatMap((f) => String(f.properties.localidad ?? '').split(';').map((n) => n.trim()).filter(Boolean)),
  ),
].sort()

const lugares = []
const sinCoincidencia = []
for (const nombre of nombres) {
  if (cache.has(nombre) && !process.argv.includes('--refresh')) { lugares.push(cache.get(nombre)); continue }
  const consulta = cache.get(nombre)?.consulta ?? nombre
  const resultado = await buscar(consulta)
  if (resultado) {
    lugares.push({
      nombre,
      consulta,
      nombreOsm: resultado.name,
      osmType: resultado.osm_type,
      osmId: resultado.osm_id,
      clase: resultado.category,
      tipo: resultado.type,
      lat: Number(resultado.lat),
      lon: Number(resultado.lon),
    })
  } else {
    sinCoincidencia.push(nombre)
  }
  await esperar(PAUSA_MS)
}

await guardarVersion({ datasetId: 'gazetteer-osm', nombre: 'Lugares OSM curados', formato: 'lugares',
    revision: new Date().toISOString(), fuente: 'OpenStreetMap (Nominatim search)',
    licencia: 'ODbL 1.0', fechaFuente: new Date().toISOString(), entradas: [versionRegistro.version.id],
    datos: { fuente: 'OpenStreetMap (Nominatim search)', atribucion: '© OpenStreetMap contributors',
      licencia: 'ODbL 1.0 (https://opendatacommons.org/licenses/odbl/)', generadoEn: new Date().toISOString(), lugares, sinCoincidencia },
  })
console.log(`${lugares.length} lugares resueltos, ${sinCoincidencia.length} sin coincidencia: ${sinCoincidencia.join(', ') || '-'}`)

} finally { await getRawClient().end() }
