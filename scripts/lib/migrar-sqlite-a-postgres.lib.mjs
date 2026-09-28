/**
 * Funciones puras de la migración SQLite → Postgres (DB1/F4).
 *
 * Vive en scripts/lib/ para poder testearse sin invocar el CLI ni abrir
 * ninguna base: acá no hay I/O de datos, sólo cálculo sobre el snapshot de
 * drizzle-kit, el DDL de GE y las filas ya leídas del origen. El orquestador
 * (scripts/migrar-sqlite-a-postgres.mjs) es quien habla con @libsql/client,
 * drizzle-orm y ge-db.ts.
 */
import { createHash } from 'node:crypto'

// El brief deja a criterio el tamaño de lote; se elige el mismo que ya usa el
// motor de riesgo para inserts masivos (ver sync-seasonal.ts y
// sync-ensemble.ts: TAMANO_CHUNK_INSERCION). Mantiene la convención del repo
// y evita un solo INSERT gigante que dispare el límite de parámetros de
// Postgres (65535) en tablas con muchas columnas.
export const TAMANO_LOTE = 500

// Orden lógico de las 5 tablas ge.* (no hay FKs declaradas, pero el orden de
// inserción correcto es éste; ver lib/infraestructura/ge-db.ts, GE_DDL).
// El nombre lleva el prefijo de schema para poder tratarlas igual que las
// public.* en el resto del pipeline.
export const ORDEN_GE = [
  'ge.ge_corte',
  'ge.ge_localizacion',
  'ge.ge_alumno_identidad',
  'ge.ge_seccion',
  'ge.ge_alumno_seccion',
]

// PK por tabla ge.*, en el orden que exige el target de un upsert con PK
// compuesta. ge_corte es la única identity del destino (columna `id`); para
// las demás la PK ya viene generada desde el origen.
export const PK_GE = {
  'ge.ge_corte': ['id'],
  'ge.ge_localizacion': ['cue_anexo'],
  'ge.ge_alumno_identidad': ['ge_person_id'],
  'ge.ge_seccion': ['corte_id', 'ge_section_id'],
  'ge.ge_alumno_seccion': ['corte_id', 'ge_section_id', 'ge_person_id'],
}

// Columnas de ge.* por tabla, en el orden del DDL. Se declaran acá (en vez de
// derivarlas del DDL en runtime) porque el DDL de GE_DDL es un array de
// sentencias CREATE TABLE con CHECK/PRIMARY KEY inline; parsearlo sería más
// frágil que esta lista explícita. Si GE_DDL cambia, este mapa debe cambiar
// junto con él (los tests comparan ambos).
export const COLUMNAS_GE = {
  'ge.ge_corte': ['id', 'ciclo_lectivo', 'fetched_at', 'estado'],
  'ge.ge_localizacion': [
    'cue_anexo', 'cui', 'nombre', 'departamento', 'localidad', 'lat', 'lon', 'geo_calidad',
  ],
  'ge.ge_alumno_identidad': ['ge_person_id', 'payload_cifrado'],
  'ge.ge_seccion': [
    'corte_id', 'ge_section_id', 'cue_anexo', 'curso', 'division', 'nivel', 'turno',
  ],
  'ge.ge_alumno_seccion': ['corte_id', 'ge_section_id', 'ge_person_id'],
}

// Tipo por tabla/columna de ge.*, espejo de GE_DDL (lib/infraestructura/ge-db.ts).
// El pipeline lo usa para decidir conversiones (jsonb/boolean/timestamp); acá no
// hay ninguna de esas: sólo integer/text/real, que pasan directo. Se declara
// explícito para que `convertirFila` reciba un `tipo` real y no dependa de un
// default implícito. Si GE_DDL cambia, este mapa debe cambiar junto con él.
export const TIPOS_GE = {
  'ge.ge_corte': {
    id: 'integer',
    ciclo_lectivo: 'integer',
    fetched_at: 'text',
    estado: 'text',
  },
  'ge.ge_localizacion': {
    cue_anexo: 'text',
    cui: 'text',
    nombre: 'text',
    departamento: 'text',
    localidad: 'text',
    lat: 'real',
    lon: 'real',
    geo_calidad: 'text',
  },
  'ge.ge_alumno_identidad': { ge_person_id: 'integer', payload_cifrado: 'text' },
  'ge.ge_seccion': {
    corte_id: 'integer',
    ge_section_id: 'integer',
    cue_anexo: 'text',
    curso: 'text',
    division: 'text',
    nivel: 'text',
    turno: 'text',
  },
  'ge.ge_alumno_seccion': {
    corte_id: 'integer',
    ge_section_id: 'integer',
    ge_person_id: 'integer',
  },
}

// Columnas con identidad GENERATED ALWAYS AS IDENTITY: el INSERT debe usar
// OVERRIDING SYSTEM VALUE para preservar los ids del origen.
const COLUMNAS_IDENTITY = new Set(['ge.ge_corte.id'])

export function tieneIdentidad(tabla, columna) {
  return COLUMNAS_IDENTITY.has(`${tabla}.${columna}`)
}

/**
 * Devuelve las columnas con `type: 'jsonb'` de una tabla del snapshot.
 * `columns` es el mapa `tables[<name>].columns` del snapshot de drizzle-kit.
 */
export function columnasJsonb(columns) {
  return Object.values(columns)
    .filter((c) => c.type === 'jsonb')
    .map((c) => c.name)
}

/** Idem para `boolean`. */
export function columnasBoolean(columns) {
  return Object.values(columns)
    .filter((c) => c.type === 'boolean')
    .map((c) => c.name)
}

/**
 * Convierte una fila cruda de SQLite a la forma que espera el destino.
 *
 * `columnas` es una lista de descriptores `{ clave, nombre, tipo }`:
 * - `nombre`: la columna tal cual viene en la fila del origen SQLite.
 * - `clave`: la clave del objeto de salida. Para las tablas public.* que
 *   inserta drizzle, es el nombre de propiedad JS (`aplicaA`), porque
 *   `.values()` de drizzle indexa por esa clave, NO por el nombre de columna.
 *   Para las ge.* que se insertan con SQL directo, coincide con el nombre.
 * - `tipo`: `'jsonb'` | `'boolean'` | cualquier otra cosa (paso directo).
 *
 * Reglas de conversión:
 * - jsonb: SQLite la guarda como text con JSON serializado (o null). Se parsea
 *   a un objeto JS: drizzle-orm lo serializa a jsonb solo (`.mapToDriverValue`
 *   hace JSON.stringify), así que re-stringify sería doble serialización. Para
 *   el SQL directo de ge.* no hay jsonb (el DDL no los tiene).
 * - boolean: SQLite persiste 0/1 (o null). Drizzle-orm NO convierte números a
 *   boolean (PGlite manda el 0/1 tal cual y Postgres lo rechaza), así que la
 *   conversión explícita es obligatoria.
 * - timestamp: las tablas better-auth (user/session/account/verification)
 *   pasaron de epoch ms `integer` (SQLite) a `timestamp` nativo (mode 'date')
 *   en pg-core. Drizzle espera un `Date` (llama value.toISOString()), así que
 *   hay que convertir el epoch ms a Date.
 * - Cualquier otra columna (text, integer, real): paso directo. Las fechas
 *   guardadas como `text` ISO (pg-core las declara `text`, ver la nota DB1-F2
 *   en lib/db/schema.ts) se conservan como string tal cual.
 */
export function convertirFila(fila, columnas) {
  const salida = {}
  for (const col of columnas) {
    const valor = fila[col.nombre]
    if (col.tipo === 'jsonb') {
      salida[col.clave] = valor === null || valor === undefined ? null : parsearJson(valor, col.nombre)
    } else if (col.tipo === 'boolean') {
      salida[col.clave] = convertirBoolean(valor)
    } else if (col.tipo === 'timestamp') {
      salida[col.clave] = convertirTimestamp(valor, col.nombre)
    } else {
      salida[col.clave] = valor === undefined ? null : valor
    }
  }
  return salida
}

function convertirTimestamp(valor, col) {
  if (valor === null || valor === undefined) return null
  if (valor instanceof Date) return valor
  if (typeof valor === 'number' || typeof valor === 'bigint') {
    return new Date(Number(valor))
  }
  const fecha = new Date(valor)
  if (Number.isNaN(fecha.getTime())) {
    throw new Error(`No se pudo interpretar la fecha de la columna "${col}": ${valor}`)
  }
  return fecha
}

function parsearJson(valor, col) {
  if (typeof valor !== 'string') return valor
  try {
    return JSON.parse(valor)
  } catch (err) {
    throw new Error(`No se pudo parsear JSON de la columna "${col}": ${err.message}`)
  }
}

function convertirBoolean(valor) {
  if (valor === null || valor === undefined) return null
  if (typeof valor === 'boolean') return valor
  if (typeof valor === 'bigint') return valor !== 0n
  if (typeof valor === 'number') return valor !== 0
  // libsql puede devolver los enteros como string en algunos drivers.
  if (typeof valor === 'string') return valor !== '0' && valor !== ''
  return Boolean(valor)
}

/**
 * Orden topológico de las tablas `public.*` a partir de
 * `tables[<key>].foreignKeys[*].tableFrom/tableTo` del snapshot de
 * drizzle-kit. Devuelve los nombres de tabla ya sin el prefijo `public.`
 * (que es como los expone el schema de drizzle: `schema[<name>]`).
 *
 * Algoritmo de Kahn: procesa todas las tablas cuyas dependencias ya fueron
 * emitidas. Desempata por orden de aparición en el snapshot para que el
 * resultado sea determinista (importante para los tests y el reporte).
 * Si detecta un ciclo, tira: un ciclo de FKs en el schema es un error de
 * diseño, no algo que el script deba tratar de resolver a ciegas.
 */
export function ordenTopologico(tables) {
  const nombres = Object.values(tables).map((t) => t.name)
  const dependencias = new Map()
  for (const t of Object.values(tables)) {
    const deps = new Set()
    for (const fk of Object.values(t.foreignKeys ?? {})) {
      // Sólo cuentan las FKs dentro de public.* (la FK a sí misma no aporta
      // orden; el schema no las tiene, pero se ignoran por robustez).
      if (fk.tableTo !== t.name) deps.add(fk.tableTo)
    }
    dependencias.set(t.name, deps)
  }

  const emitidas = new Set()
  const orden = []
  const pendientes = new Set(nombres)

  while (pendientes.size > 0) {
    let progreso = false
    for (const nombre of nombres) {
      if (emitidas.has(nombre)) continue
      const deps = dependencias.get(nombre)
      const listas = [...deps].every((d) => !pendientes.has(d))
      if (!listas) continue
      orden.push(nombre)
      emitidas.add(nombre)
      pendientes.delete(nombre)
      progreso = true
    }
    if (!progreso) {
      const enCiclo = [...pendientes].sort()
      throw new Error(`Ciclo de FKs entre tablas public.*: ${enCiclo.join(', ')}`)
    }
  }
  return orden
}

/**
 * PK declarada de una tabla del snapshot, en el orden del snapshot. Primero
 * las columnas con `primaryKey: true` (PK simple) y si no hay, la PK compuesta
 * de `compositePrimaryKeys`. Para las 46 public.* el orden importa poco (todas
 * tienen una sola columna salvo las compuestas), pero para ge.* es el contrato
 * del `target` del upsert.
 */
export function pkDeSnapshot(table) {
  const simples = Object.values(table.columns)
    .filter((c) => c.primaryKey)
    .map((c) => c.name)
  if (simples.length > 0) return simples
  const compuestas = Object.values(table.compositePrimaryKeys ?? {})
  if (compuestas.length > 0) return compuestas[0].columns
  throw new Error(`La tabla "${table.name}" no tiene PK declarada en el snapshot`)
}

/**
 * Checksum simple y estable por tabla: sha256 de las PKs ordenadas y unidas
 * por coma. Sirve para detectar filas faltantes o con PK distinta aunque el
 * COUNT(*) coincida (p. ej. una fila borrada y otra agregada).
 *
 * `filas` es un array de arrays de valores de PK (una entrada por fila).
 */
export function checksumPks(filasPk) {
  const claves = filasPk.map((pk) => pk.map((v) => (v === null || v === undefined ? '' : String(v))).join('\u0001'))
  claves.sort()
  const hash = createHash('sha256')
  hash.update(claves.join('\u0000'), 'utf8')
  return hash.digest('hex')
}

/**
 * Compara origen y destino para una tabla y devuelve un resultado legible.
 * `pksOrigen` y `pksDestino` son arrays de arrays de valores de PK.
 */
export function compararTabla({ tabla, pksOrigen, pksDestino }) {
  const conteoOrigen = pksOrigen.length
  const conteoDestino = pksDestino.length
  const checksumOrigen = checksumPks(pksOrigen)
  const checksumDestino = checksumPks(pksDestino)
  return {
    tabla,
    conteoOrigen,
    conteoDestino,
    diferencia: conteoDestino - conteoOrigen,
    checksumOrigen,
    checksumDestino,
    checksumOk: checksumOrigen === checksumDestino,
    filasFaltantes: faltantes(pksOrigen, pksDestino, 5),
    filasExtra: faltantes(pksDestino, pksOrigen, 5),
  }
}

function clave(pk) {
  return pk.map((v) => (v === null || v === undefined ? '' : String(v))).join('\u0001')
}

function faltantes(referencia, observadas, limite) {
  const set = new Set(observadas.map(clave))
  const salida = []
  for (const pk of referencia) {
    if (set.has(clave(pk))) continue
    salida.push(pk)
    if (salida.length >= limite) break
  }
  return salida
}

/**
 * Formatea una línea del reporte por tabla, para usar en stdout y en el
 * archivo de evidencia. `estado` es 'OK' o 'FALLA'.
 */
export function formatearLineaReporte(r) {
  const estado = r.checksumOk && r.conteoOrigen === r.conteoDestino ? 'OK' : 'FALLA'
  const checksum = r.checksumOk ? 'checksum=ok' : `checksum=DISTINTO(${r.checksumOrigen} vs ${r.checksumDestino})`
  return `${estado.padEnd(5)} ${r.tabla.padEnd(34)} origen=${r.conteoOrigen} destino=${r.conteoDestino} diff=${r.diferencia} ${checksum}`
}
