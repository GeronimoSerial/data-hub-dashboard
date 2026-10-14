#!/usr/bin/env node
// Curation-time gazetteer for the reported flood events registry.
//
// Resolves every named place in public/data/eventos-inundaciones/eventos.geojson
// against OpenStreetMap (Nominatim search) and writes
// public/data/eventos-inundaciones/gazetteer-osm.json. The app never calls
// Nominatim at runtime; rerun this script when the registry changes.
//
// Nominatim usage policy: at most 1 request per second, descriptive User-Agent,
// results cached in the output file. Data © OpenStreetMap contributors (ODbL).

import { readFileSync, writeFileSync } from 'node:fs'

const REGISTRO = 'public/data/eventos-inundaciones/eventos.geojson'
const SALIDA = 'public/data/eventos-inundaciones/gazetteer-osm.json'
const NOMINATIM = 'https://nominatim.openstreetmap.org/search'
const USER_AGENT = 'data-hub-dashboard gazetteer curation (https://github.com/GeronimoSerial/data-hub-dashboard)'
const PAUSA_MS = 1100

// Search text per place when the registry name alone is ambiguous in OSM.
const CONSULTAS = {
  'Isla Apipé': 'Isla Apipé Grande',
  'Ituzaingó (Isla Apipé)': 'Isla Apipé Grande',
  'Ituzaingó (represa Yacyretá)': 'Represa Yacyretá',
  Corrientes: 'Corrientes, Capital',
}

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

const registro = JSON.parse(readFileSync(REGISTRO, 'utf8'))
const nombres = [
  ...new Set(
    registro.features.flatMap((f) => String(f.properties.localidad ?? '').split(';').map((n) => n.trim()).filter(Boolean)),
  ),
].sort()

const lugares = []
const sinCoincidencia = []
for (const nombre of nombres) {
  const consulta = CONSULTAS[nombre] ?? nombre
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

writeFileSync(
  SALIDA,
  `${JSON.stringify(
    {
      fuente: 'OpenStreetMap (Nominatim search)',
      atribucion: '© OpenStreetMap contributors',
      licencia: 'ODbL 1.0 (https://opendatacommons.org/licenses/odbl/)',
      generadoEn: new Date().toISOString(),
      lugares,
      sinCoincidencia,
    },
    null,
    2,
  )}\n`,
)
console.log(`${lugares.length} lugares resueltos, ${sinCoincidencia.length} sin coincidencia: ${sinCoincidencia.join(', ') || '-'}`)
