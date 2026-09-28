#!/usr/bin/env node
/**
 * Genera public/data/natalidad/{departamentos.json,escuelas.geojson} a
 * partir de los snapshots versionados (data/natalidad/*.json). Sin
 * `--refresh-pbi` corre 100% offline: nunca depende del Postgres temporario
 * del padrón (ver odd/tasks/mapa-natalidad.md, "Constraints").
 *
 * T5 (2026-09-25): las escuelas ya no salen de inicial-2026-padron.json +
 * public/data/localizaciones.json (sólo inicial, coordenadas ajenas al
 * mapa). Ahora usan:
 * - data/natalidad/localizaciones-geo-2025-10-02.json — relevamiento GEO,
 *   TODAS las escuelas activas de la provincia, con sus propias
 *   coordenadas. Convertido a mano de
 *   2025-10-02_Localizaciones_(GEO).xlsx (sin agregar una dependencia xlsx:
 *   conversión puntual, no repetible por este script).
 * - data/natalidad/escuelas-2026-padron.json — padrón Gestión Educativa,
 *   ciclo 2026, TODOS los niveles (una fila por CUE×nivel×curso).
 * public/data/localizaciones.json queda intacto (lo sigue usando el mapa de
 * infraestructura); este mapa ya no lo lee.
 *
 * Usage:
 *   pnpm extract:natalidad
 *   pnpm extract:natalidad -- --refresh-pbi   (re-descarga nacidos vivos desde
 *     el Power BI público antes de generar la salida; ver refreshNacidosVivosDesdePBI)
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { registerHooks } from 'node:module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

// lib/mapas/natalidad.ts importa './departamentos' sin extensión (estilo TS
// normal); el resolver ESM de Node no la completa. Mismo hook que
// scripts/sync-ge.mjs: agrega '.ts' antes de resolver un especificador
// relativo sin extensión, así el script puede importar el módulo real de
// lib/ tal cual, sin duplicar sus transforms.
function resolveTsCandidate(base) {
  for (const candidate of [`${base}.ts`, join(base, 'index.ts')]) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('./') || specifier.startsWith('../')) {
      const base = join(dirname(fileURLToPath(context.parentURL)), specifier)
      const candidate = resolveTsCandidate(base)
      if (candidate) return { url: pathToFileURL(candidate).href, shortCircuit: true }
    }
    return nextResolve(specifier, context)
  },
})

const {
  construirDatosNatalidad,
  construirEscuelasCompletas,
  construirFeatureCollectionEscuelas,
  sanearCoordenadasFueraDeLimites,
} = await import('../lib/mapas/natalidad.ts')

const NACIMIENTOS_PATH = join(root, 'data', 'natalidad', 'nacidos-vivos-corrientes.json')
const GEO_PATH = join(root, 'data', 'natalidad', 'localizaciones-geo-2025-10-02.json')
const PADRON_PATH = join(root, 'data', 'natalidad', 'escuelas-2026-padron.json')
const DEPARTAMENTOS_GEOJSON_PATH = join(root, 'public', 'data', 'departamentos-corrientes.geojson')
const OUT_DIR = join(root, 'public', 'data', 'natalidad')

const FUENTE_NATALIDAD = {
  nombre:
    'DEIS / Ministerio de Capital Humano – OEI, "Tendencias demográficas recientes e impactos en las ofertas del nivel inicial"',
  url: 'https://app.powerbi.com/view?r=eyJrIjoiYmEwYWM4N2EtOWViOS00MmQ2LTg1NGMtNDlmMGRmZDRmNjY1IiwidCI6ImE1YmEzMDQ2LTNmMzQtNDI0Mi1iZjc4LTk5NDY1ODk2MGI4MCJ9',
}
// T5: strings listas para mostrar tal cual en el panel de título del mapa.
const FUENTE_LOCALIZACIONES = 'Localizaciones: relevamiento GEO 2025-10-02'
const FUENTE_SECCIONES = 'Secciones: padrón Gestión Educativa, ciclo 2026'

// ── --refresh-pbi: port mínimo de scratchpad/pbi.py ─────────────────────────
//
// pbi.py es un cliente genérico de la API pública `querydata` de Power BI
// (autenticación por resource key, sin login). Este puerto sólo cubre la
// consulta puntual que necesitamos: la tabla 01_NacidosVivos filtrada a
// Corrientes. Los nombres de entidad/columna son los que documenta
// odd/tasks/mapa-natalidad.md (fuente); si el reporte cambia de esquema esta
// función es el único lugar que hay que tocar — el resto del script no sabe
// nada de Power BI.
const PBI_RESOURCE_KEY = 'ba0ac87a-9eb9-42d6-854c-49f0dfd4f665'
const PBI_URL =
  'https://wabi-paas-1-scus-api.analysis.windows.net/public/reports/querydata?synchronous=true'
const PBI_MODEL_ID = 5444310
const PBI_DATASET_ID = 'b36577aa-a1d5-444b-a5c1-55822a7df900'
const PBI_ENTITY = '01_NacidosVivos'
// Grouping columns, in output order; births are summed per group.
const PBI_COLUMNS = ['01_Año', '00_CODDPTO', '03_Departamento']
const PBI_MEASURE = '04_NacidosVivos'
const PBI_PROVINCIA = 'Corrientes'

function construirConsultaPBI(entidad, columnas) {
  const ref = { SourceRef: { Source: 't' } }
  const select = columnas.map((c) => ({
    Column: { Expression: ref, Property: c },
    Name: `t.${c}`,
  }))
  select.push({
    Aggregation: { Expression: { Column: { Expression: ref, Property: PBI_MEASURE } }, Function: 0 },
    Name: `Sum(t.${PBI_MEASURE})`,
  })
  return {
    Version: 2,
    From: [{ Name: 't', Entity: entidad, Type: 0 }],
    Select: select,
    Where: [
      {
        Condition: {
          In: {
            Expressions: [{ Column: { Expression: ref, Property: '02_Provincia' } }],
            Values: [[{ Literal: { Value: `'${PBI_PROVINCIA}'` } }]],
          },
        },
      },
    ],
  }
}

function construirCuerpoPBI(query) {
  return {
    version: '1.0.0',
    queries: [
      {
        Query: {
          Commands: [
            {
              SemanticQueryDataShapeCommand: {
                Query: query,
                Binding: {
                  Primary: { Groupings: [{ Projections: query.Select.map((_, i) => i) }] },
                  DataReduction: { DataVolume: 4, Primary: { Window: { Count: 30000 } } },
                  Version: 1,
                },
              },
            },
          ],
        },
        QueryId: '',
        ApplicationContext: { DatasetId: PBI_DATASET_ID, Sources: [{ ReportId: '', VisualId: '' }] },
      },
    ],
    cancelQueries: [],
    modelId: PBI_MODEL_ID,
  }
}

/**
 * Decodifica el DSR (Data Shape Result) que devuelve querydata: cada fila
 * trae un bitmask `R` (repetir el valor de la fila anterior) y `Ø` (null), y
 * un array `C` con sólo los valores que cambiaron. `DN` en el schema apunta a
 * un ValueDict (diccionario de strings repetidos, para no mandarlos crudos en
 * cada fila). Puerto directo de `rows()` en scratchpad/pbi.py — misma
 * semántica bit a bit.
 */
export function decodificarFilasPBI(resultado) {
  const ds = resultado.results[0].result.data.dsr.DS[0]
  const valueDicts = ds.ValueDicts ?? {}
  const ph = ds.PH[0]
  const key = Object.keys(ph).find((k) => k.startsWith('DM'))
  const filasCrudas = ph[key] ?? []

  const filas = []
  let schema = null
  let anterior = null

  for (const fila of filasCrudas) {
    if (fila.S) schema = fila.S
    const valores = anterior ? [...anterior] : new Array(schema.length).fill(null)
    const columnasCambiadas = [...(fila.C ?? [])]
    const repetir = fila.R ?? 0
    const nulos = fila.Ø ?? 0
    let cIdx = 0

    for (let i = 0; i < schema.length; i++) {
      if ((repetir >> i) & 1) continue // conserva el valor de `anterior`
      if ((nulos >> i) & 1) {
        valores[i] = null
        continue
      }
      let valor = columnasCambiadas[cIdx]
      cIdx += 1
      if (schema[i].DN != null && typeof valor === 'number') {
        valor = valueDicts[schema[i].DN][valor]
      }
      valores[i] = valor
    }

    filas.push(valores)
    anterior = valores
  }

  return filas
}

async function consultarPBI(entidad, columnas) {
  const body = construirCuerpoPBI(construirConsultaPBI(entidad, columnas))
  const respuesta = await fetch(PBI_URL, {
    method: 'POST',
    headers: {
      'X-PowerBI-ResourceKey': PBI_RESOURCE_KEY,
      'Content-Type': 'application/json',
      'Accept-Encoding': 'gzip',
    },
    body: JSON.stringify(body),
  })
  if (!respuesta.ok) {
    throw new Error(`Power BI querydata respondió ${respuesta.status}`)
  }
  const buffer = Buffer.from(await respuesta.arrayBuffer())
  let texto
  try {
    texto = gunzipSync(buffer).toString('utf8')
  } catch {
    texto = buffer.toString('utf8') // no siempre viene gzipeado
  }
  return JSON.parse(texto)
}

/**
 * Re-descarga nacidos vivos desde el Power BI público y sobreescribe el
 * snapshot versionado, filtrando a Corrientes. Best-effort: el esquema real
 * de la entidad/columnas del reporte no está verificado contra la API en
 * vivo (requiere red saliente autorizada aparte); si Power BI cambia nombres
 * de columna o entidad, ajustar PBI_ENTITY/PBI_COLUMNS arriba.
 */
export async function refreshNacidosVivosDesdePBI() {
  const resultado = await consultarPBI(PBI_ENTITY, PBI_COLUMNS)
  const filas = decodificarFilasPBI(resultado)

  const rows = filas
    .map(([anio, coddpto, departamento, nacidosVivos]) => ({
      anio: Number(anio),
      coddpto: String(coddpto),
      departamento: String(departamento),
      nacidosVivos: Number(nacidosVivos),
    }))
    .filter((row) => row.coddpto.startsWith('18'))

  if (rows.length === 0) {
    throw new Error(
      'Power BI no devolvió filas para Corrientes: revisar PBI_ENTITY/PBI_COLUMNS antes de sobreescribir el snapshot',
    )
  }

  writeFileSync(NACIMIENTOS_PATH, `${JSON.stringify(rows, null, 1)}\n`)
  console.log(`nacidos-vivos-corrientes.json actualizado desde Power BI: ${rows.length} filas`)
}

// ── Lectura de snapshots + generación de la salida pública ─────────────────

function leerJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

async function main() {
  const refreshPbi = process.argv.includes('--refresh-pbi')
  if (refreshPbi) {
    await refreshNacidosVivosDesdePBI()
  }

  const nacimientos = leerJson(NACIMIENTOS_PATH)
  const geoRaw = leerJson(GEO_PATH)
  const padron = leerJson(PADRON_PATH)
  const departamentosGeojson = leerJson(DEPARTAMENTOS_GEOJSON_PATH)
  const nombresDepartamentosConocidos = departamentosGeojson.features.map((f) => f.properties.nombre)

  // Limpia las filas del GEO con coordenadas fuera de la provincia:
  // point-in-polygon contra la unión de departamentos, con 1km de tolerancia
  // al contorno (la geometría simplificada deja huecos en la costa del
  // Paraná/Uruguay — ver sanearCoordenadasFueraDeLimites, corrección
  // 2026-09-25). Nunca se descartan en silencio, se loguean abajo con su
  // distancia al contorno más cercano.
  const { rows: geo, descartadas: fueraDeLimites } = sanearCoordenadasFueraDeLimites(
    geoRaw,
    departamentosGeojson,
  )

  const { escuelas, padronSinGeo } = construirEscuelasCompletas(geo, padron)

  const datos = construirDatosNatalidad({
    nacimientos,
    escuelas,
    nombresDepartamentosConocidos,
    fuenteNatalidad: FUENTE_NATALIDAD,
    fuenteLocalizaciones: FUENTE_LOCALIZACIONES,
    fuenteSecciones: FUENTE_SECCIONES,
    extraidoEn: new Date().toISOString().slice(0, 10),
  })

  const { featureCollection, sinCoordenadas } = construirFeatureCollectionEscuelas(escuelas)

  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(join(OUT_DIR, 'departamentos.json'), `${JSON.stringify(datos, null, 1)}\n`)
  // T11 (perf): escuelas.geojson es un archivo servido al browser (fetch +
  // JSON.parse en cada carga del mapa), no un artefacto pensado para diff —
  // pretty-print con indent agregaba ~1996 features × varias líneas de
  // espacios que sólo aumentan bytes por red sin beneficio (el pretty de
  // departamentos.json sí vale la pena: es chico y se lee a mano seguido).
  writeFileSync(join(OUT_DIR, 'escuelas.geojson'), `${JSON.stringify(featureCollection)}\n`)

  console.log(`departamentos.json: ${datos.departamentos.length} departamentos, años ${datos.meta.anioInicio}-${datos.meta.anioFin}`)
  if (datos.departamentosSinMatch.length > 0) {
    console.warn(`Departamento(s) sin match geográfico: ${datos.departamentosSinMatch.join(', ')}`)
  }

  console.log(`GEO: ${geoRaw.length} escuelas activas, ${geo.filter((r) => r.lat != null && r.lon != null).length} con coordenadas dentro de la provincia`)
  if (fueraDeLimites.length > 0) {
    console.warn(
      `Coordenadas descartadas por estar fuera de la provincia (${fueraDeLimites.length}, más de 1km del contorno más cercano): ` +
        fueraDeLimites
          .map((r) => `${r.cueAnexo} "${r.nombre}" (${r.lat}, ${r.lon}) — ${r.distanciaKm.toFixed(1)}km`)
          .join('; '),
    )
  }

  const geoSoloSinPadron = escuelas.filter((e) => e.lat != null && !e.tienePadron).length
  console.log(`Escuelas del GEO sin fila en el padrón 2026 (nivel inferido de ofertaTipo cuando fue posible): ${geoSoloSinPadron}`)

  if (padronSinGeo.length > 0) {
    console.warn(
      `CUEs del padrón sin fila en el GEO (${padronSinGeo.length}, sin coordenadas posibles — nunca se descartan, quedan en los agregados por departamento): ` +
        `muestra: ${padronSinGeo.slice(0, 10).join(', ')}`,
    )
  }

  console.log(`escuelas.geojson: ${featureCollection.features.length} escuelas geolocalizadas de ${escuelas.length} escuelas totales`)
  console.log(`Escuelas sin coordenadas utilizables: ${sinCoordenadas}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main()
}
