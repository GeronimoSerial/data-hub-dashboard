#!/usr/bin/env node
/**
 * Genera public/data/natalidad/{departamentos.json,inicial.geojson} a partir
 * de los snapshots versionados (data/natalidad/*.json) y de las coordenadas
 * de public/data/localizaciones.json. Sin `--refresh-pbi` corre 100%
 * offline: nunca depende del Postgres temporario del padrón (ver
 * odd/tasks/mapa-natalidad.md, "Constraints").
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
  agruparInicialPorCue,
  construirDatosNatalidad,
  construirFeatureCollectionInicial,
} = await import('../lib/mapas/natalidad.ts')

const NACIMIENTOS_PATH = join(root, 'data', 'natalidad', 'nacidos-vivos-corrientes.json')
const INICIAL_PATH = join(root, 'data', 'natalidad', 'inicial-2026-padron.json')
const LOCALIZACIONES_PATH = join(root, 'public', 'data', 'localizaciones.json')
const DEPARTAMENTOS_GEOJSON_PATH = join(root, 'public', 'data', 'departamentos-corrientes.geojson')
const OUT_DIR = join(root, 'public', 'data', 'natalidad')

const FUENTE_NATALIDAD = {
  nombre:
    'DEIS / Ministerio de Capital Humano – OEI, "Tendencias demográficas recientes e impactos en las ofertas del nivel inicial"',
  url: 'https://app.powerbi.com/view?r=eyJrIjoiYmEwYWM4N2EtOWViOS00MmQ2LTg1NGMtNDlmMGRmZDRmNjY1IiwidCI6ImE1YmEzMDQ2LTNmMzQtNDI0Mi1iZjc4LTk5NDY1ODk2MGI4MCJ9',
}
const FUENTE_INICIAL = 'Padrón Gestión Educativa, ciclo lectivo 2026'

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
  const inicial = leerJson(INICIAL_PATH)
  const localizaciones = leerJson(LOCALIZACIONES_PATH)
  const departamentosGeojson = leerJson(DEPARTAMENTOS_GEOJSON_PATH)
  const nombresDepartamentosConocidos = departamentosGeojson.features.map((f) => f.properties.nombre)

  const datos = construirDatosNatalidad({
    nacimientos,
    inicial,
    nombresDepartamentosConocidos,
    fuenteNatalidad: FUENTE_NATALIDAD,
    fuenteInicial: FUENTE_INICIAL,
    extraidoEn: new Date().toISOString().slice(0, 10),
  })

  const escuelasPorCue = agruparInicialPorCue(inicial)
  const { featureCollection, cuesSinCoordenadas, cuesTotal } = construirFeatureCollectionInicial(
    escuelasPorCue,
    localizaciones,
  )

  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(join(OUT_DIR, 'departamentos.json'), `${JSON.stringify(datos, null, 1)}\n`)
  writeFileSync(join(OUT_DIR, 'inicial.geojson'), `${JSON.stringify(featureCollection, null, 1)}\n`)

  console.log(`departamentos.json: ${datos.departamentos.length} departamentos, años ${datos.meta.anioInicio}-${datos.meta.anioFin}`)
  if (datos.departamentosSinMatch.length > 0) {
    console.warn(`Departamento(s) sin match geográfico: ${datos.departamentosSinMatch.join(', ')}`)
  }
  console.log(`inicial.geojson: ${featureCollection.features.length} escuelas geolocalizadas de ${cuesTotal} CUEs con oferta`)
  console.log(`CUEs sin coordenadas: ${cuesSinCoordenadas}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main()
}
