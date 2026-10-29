import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'

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
    tramosSinPavimentarKm: numeroONull(fila.tramos_sin_pavimentar_km),
    crucesAguaCount: numeroONull(fila.cruces_agua_count),
    crucesAguaConPuenteCount: numeroONull(fila.cruces_agua_con_puente_count),
    crucesAguaConVadoCount: numeroONull(fila.cruces_agua_con_vado_count),
    crucesAguaConVadoExplicitoCount: numeroONull(fila.cruces_agua_con_vado_explicito_count),
    crucesAguaConVadoProbableCount: numeroONull(fila.cruces_agua_con_vado_probable_count),
    tieneAlternativaSinCruce: booleanONull(fila.tiene_alternativa_sin_cruce),
    tieneAlternativaPavimentada: booleanONull(fila.tiene_alternativa_pavimentada),
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
  tramosSinPavimentarKm: numeroONullSchema,
  crucesAguaCount: numeroONullSchema,
  crucesAguaConPuenteCount: numeroONullSchema,
  crucesAguaConVadoCount: numeroONullSchema,
  crucesAguaConVadoExplicitoCount: numeroONullSchema,
  crucesAguaConVadoProbableCount: numeroONullSchema,
  tieneAlternativaSinCruce: z.boolean().nullable(),
  tieneAlternativaPavimentada: z.boolean().nullable(),
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

async function importarCsv(path, { db, tabla }, mapearFila, schemaFila, etiqueta) {
  const filas = leerCsv(path).map(mapearFila)
  let ok = 0
  let fallidas = 0
  for (const fila of filas) {
    const parseo = schemaFila.safeParse(fila)
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
  console.log(`[importar-geo-static] ${etiqueta}: procesadas ${filas.length}, ok ${ok}, fallidas ${fallidas}`)
  return { procesadas: filas.length, ok, fallidas }
}

export async function importarAislamiento(path, opts) {
  return importarCsv(path, opts, mapearFilaAislamiento, schemaFilaAislamiento, 'aislamiento')
}

export async function importarSusceptibilidad(path, opts) {
  return importarCsv(path, opts, mapearFilaSusceptibilidad, schemaFilaSusceptibilidad, 'susceptibilidad')
}

/** Lee un NDJSON comprimido con gzip y devuelve sus lineas no vacias (texto
 * crudo, sin parsear: una linea con JSON malformado no debe abortar el
 * archivo, se reporta como fallida en importarNdjson). */
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
    // Metres per surface ride inside the via_principal JSON so no column is needed.
    viaPrincipal: fila.via_principal == null
      ? null
      : JSON.stringify(fila.superficies ? { ...fila.via_principal, superficies: fila.superficies } : fila.via_principal),
    destinoNombre: fila.destino?.nombre ?? null,
    distanciaDestinoM: fila.distancia_destino_m ?? null,
    motivoSinGeometria: fila.motivo_sin_geometria,
    // Extracts produced before the job associated building footprints omit it.
    edificio: fila.edificio ?? null,
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
  clasificacion: z.enum(['puente', 'vado', 'vado_probable', 'sin_evidencia']),
  // Optional: extracts produced before the job exported names omit them.
  nombreCurso: z.string().nullable().optional(),
  nombrePuente: z.string().nullable().optional(),
  tipoCurso: z.string().nullable().optional(),
  intermitente: z.boolean().nullable().optional(),
})

const viaPrincipalObjetoSchema = z.object({
  nombre: z.string().nullable(),
  tipo: z.string().min(1),
  pavimentada: z.boolean(),
  superficies: z.object({
    pavimentado: z.number().finite().nonnegative(),
    ripio: z.number().finite().nonnegative(),
    tierra: z.number().finite().nonnegative(),
  }).optional(),
})

const viaPrincipalGeometriaSchema = z.string().nullable().superRefine((valor, contexto) => {
  if (valor === null) return
  let objeto
  try {
    objeto = JSON.parse(valor)
  } catch {
    contexto.addIssue({ code: 'custom', message: 'viaPrincipal debe contener JSON valido' })
    return
  }
  const parseo = viaPrincipalObjetoSchema.safeParse(objeto)
  if (!parseo.success) {
    contexto.addIssue({ code: 'custom', message: 'viaPrincipal no cumple el esquema esperado' })
  }
})

const edificioGeometriaSchema = z
  .object({
    asociacion: z.enum(['dentro', 'nombre', 'cercania', 'ambigua']),
    distanciaM: z.number().finite().nonnegative().nullable(),
    osmId: z.union([z.number(), z.string()]).nullable(),
    poligono: z
      .object({ type: z.enum(['Polygon', 'MultiPolygon']), coordinates: z.array(z.any()).min(1) })
      .nullable(),
    candidatos: z.number().int().nonnegative(),
  })
  .nullable()

/** Esquema de una fila de geometria ya mapeada (camelCase). Refuerza ademas la
 * regla de negocio: sin ruta (`ruta` null) el job debe declarar el motivo. */
const schemaFilaGeometria = z
  .object({
    cueAnexo: z.string().min(1, 'cue_anexo no puede estar vacio'),
    versionJob: z.string().min(1, 'version_job no puede estar vacio'),
    ruta: rutaGeometriaSchema,
    cruces: z.array(cruceGeometriaSchema),
    viaPrincipal: viaPrincipalGeometriaSchema,
    destinoNombre: z.string().min(1).nullable(),
    distanciaDestinoM: z.number().finite().nonnegative().nullable(),
    motivoSinGeometria: z.string().nullable(),
    edificio: edificioGeometriaSchema,
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
  viaPrincipal: sql`excluded.via_principal`,
  destinoNombre: sql`excluded.destino_nombre`,
  distanciaDestinoM: sql`excluded.distancia_destino_m`,
  motivoSinGeometria: sql`excluded.motivo_sin_geometria`,
  edificio: sql`excluded.edificio`,
  fechaExtractoOsm: sql`excluded.fecha_extracto_osm`,
  licencia: sql`excluded.licencia`,
  importadoEn: sql`excluded.importado_en`,
}

const TAMANO_LOTE_GEOMETRIA = 200

/** Parsea y valida un NDJSON.gz fila por fila: devuelve las filas validas ya
 * mapeadas y cuenta las invalidas sin abortar el archivo. */
function parsearNdjson(path, mapearFila, schemaFila) {
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
    const parseo = schemaFila.safeParse(mapearFila(cruda))
    if (!parseo.success) {
      console.warn(
        `[importar-geo-static] fila invalida (${cruda.cue_anexo ?? '?'}): ${formatearIssues(parseo.error)}`,
      )
      fallidas++
      continue
    }
    validas.push(parseo.data)
  }
  return { lineas, validas, fallidas }
}

async function importarNdjson(path, { db, tabla }, mapearFila, schemaFila, set, etiqueta) {
  const { lineas, validas, fallidas } = parsearNdjson(path, mapearFila, schemaFila)

  for (let i = 0; i < validas.length; i += TAMANO_LOTE_GEOMETRIA) {
    const lote = validas.slice(i, i + TAMANO_LOTE_GEOMETRIA)
    await db
      .insert(tabla)
      .values(lote)
      .onConflictDoUpdate({
        target: [tabla.cueAnexo, tabla.versionJob],
        set,
      })
  }

  const ok = validas.length
  console.log(`[importar-geo-static] ${etiqueta}: procesadas ${lineas.length}, ok ${ok}, fallidas ${fallidas}`)
  return { procesadas: lineas.length, ok, fallidas }
}

export async function importarGeometria(path, opts) {
  return importarNdjson(
    path, opts, mapearFilaGeometria, schemaFilaGeometria, setGeometriaExcluido, 'geometria',
  )
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

export async function importarExposicionRuta(path, opts) {
  return importarNdjson(
    path,
    opts,
    mapearFilaExposicionRuta,
    schemaFilaExposicionRuta,
    setExposicionRutaExcluido,
    'exposicion-ruta',
  )
}

// ---------------------------------------------------------------------------
// Capas v2 de inundación (JRC 90 m). Solo actualizan columnas v2 de filas que
// ya existen (v1 importado), identificadas por cue_anexo. No crean filas: la
// fila v1 aporta las columnas NOT NULL que la capa v2 no trae.
// ---------------------------------------------------------------------------

/** Booleano en texto del CSV v2 ('True'/'False'); vacio → null. Otro texto
 * se deja como string para que el schema lo rechace. */
const booleanoTextoONull = (v) => {
  if (v === '' || v === undefined) return null
  if (v === 'True') return true
  if (v === 'False') return false
  return v
}

/** Numero de un JSON: null/undefined/'' → null (Number(null) daría 0). */
const numeroJsonONull = (v) => (v === null || v === undefined || v === '' ? null : Number(v))

function mapearFilaInundacionV2(fila) {
  return {
    cueAnexo: fila.cue_anexo,
    claseRio: vacioANull(fila.clase_rio),
    profundidadRp10M: numeroONull(fila.profundidad_rp10_m),
    profundidadRp100M: numeroONull(fila.profundidad_rp100_m),
    profundidadRp500M: numeroONull(fila.profundidad_rp500_m),
    margenRp10M: numeroONull(fila.margen_rp10_m),
    margenRp100M: numeroONull(fila.margen_rp100_m),
    margenRp500M: numeroONull(fila.margen_rp500_m),
    juntoLaguna: booleanoTextoONull(fila.junto_laguna),
    distanciaAguaM: numeroONull(fila.distancia_agua_m),
    alturaSobreAguaM: numeroONull(fila.altura_sobre_agua_m),
    versionInundacion: numeroONull(fila.version_job),
  }
}

function mapearFilaExposicionRutaV2(fila) {
  return {
    cueAnexo: fila.cue_anexo,
    claseRuta: vacioANull(fila.clase_ruta),
    muestrasTotal: numeroJsonONull(fila.muestras_total),
    muestrasExpuestas: numeroJsonONull(fila.muestras_expuestas),
    muestrasSinDato: numeroJsonONull(fila.muestras_sin_dato),
    profundidadMaxRp10M: numeroJsonONull(fila.profundidad_max_rp10_m),
    profundidadMaxRp100M: numeroJsonONull(fila.profundidad_max_rp100_m),
    profundidadMaxRp500M: numeroJsonONull(fila.profundidad_max_rp500_m),
  }
}

const claseInundacionSchema = z.enum(['alto', 'medio', 'bajo', 'sin_riesgo', 'sin_dato'])
const claseRutaSchema = z.enum(['alto', 'medio', 'bajo', 'sin_riesgo', 'sin_dato', 'sin_ruta'])
const profundidadV2Schema = z.number().finite().nonnegative().nullable()
const enteroNoNegativoV2Schema = z.number().int().nonnegative().nullable()

/** Columnas v2 de infra_susceptibilidad_estatica. versionInundacion = version_job del CSV. */
const schemaFilaInundacionV2 = z.object({
  cueAnexo: z.string().min(1, 'cue_anexo no puede estar vacio'),
  claseRio: claseInundacionSchema.nullable(),
  profundidadRp10M: profundidadV2Schema,
  profundidadRp100M: profundidadV2Schema,
  profundidadRp500M: profundidadV2Schema,
  margenRp10M: z.number().finite().nullable(),
  margenRp100M: z.number().finite().nullable(),
  margenRp500M: z.number().finite().nullable(),
  juntoLaguna: z.boolean().nullable(),
  distanciaAguaM: z.number().finite().nonnegative().nullable(),
  alturaSobreAguaM: z.number().finite().nullable(),
  versionInundacion: z.number().int().nonnegative(),
})

/** Columnas v2 de infra_exposicion_ruta_inundacion. */
const schemaFilaExposicionRutaV2 = z.object({
  cueAnexo: z.string().min(1, 'cue_anexo no puede estar vacio'),
  claseRuta: claseRutaSchema.nullable(),
  muestrasTotal: enteroNoNegativoV2Schema,
  muestrasExpuestas: enteroNoNegativoV2Schema,
  muestrasSinDato: enteroNoNegativoV2Schema,
  profundidadMaxRp10M: profundidadV2Schema,
  profundidadMaxRp100M: profundidadV2Schema,
  profundidadMaxRp500M: profundidadV2Schema,
})

/** Actualiza solo las columnas v2 de la fila existente con ese cue_anexo.
 * Las filas sin fila v1 base se cuentan aparte (no se insertan). */
async function actualizarV2(validas, { db, tabla }, etiqueta, procesadas, fallidas) {
  const bases = await db.select({ cue: tabla.cueAnexo, version: tabla.versionJob, fecha: tabla.importadoEn }).from(tabla)
  const elegidas = new Map()
  for (const base of bases) {
    const actual = elegidas.get(base.cue)
    if (!actual || Date.parse(base.fecha) > Date.parse(actual.fecha)
      || (base.fecha === actual.fecha && Number(base.version) > Number(actual.version))) elegidas.set(base.cue, base)
  }
  let ok = 0
  let sinFilaBase = 0
  for (const { cueAnexo, ...columnasV2 } of validas) {
    const base = elegidas.get(cueAnexo)
    if (!base) { sinFilaBase++; continue }
    const actualizadas = await db
      .update(tabla)
      .set(columnasV2)
      .where(and(eq(tabla.cueAnexo, cueAnexo), eq(tabla.versionJob, base.version)))
      .returning({ cueAnexo: tabla.cueAnexo })
    if (actualizadas.length > 0) ok++
    else sinFilaBase++
  }
  console.log(
    `[importar-geo-static] ${etiqueta}: procesadas ${procesadas}, ok ${ok}, sin_fila_base ${sinFilaBase}, fallidas ${fallidas}`,
  )
  return { procesadas, ok, sinFilaBase, fallidas }
}

export async function importarInundacionV2(path, opts) {
  const filas = leerCsv(path).map(mapearFilaInundacionV2)
  const { validas, fallidas } = validarFilas(filas, schemaFilaInundacionV2)
  return actualizarV2(validas, opts, 'inundacion-v2', filas.length, fallidas)
}

export async function importarExposicionRutaV2(path, opts) {
  const { lineas, validas: mapeadasValidas, fallidas } = parsearNdjson(
    path, mapearFilaExposicionRutaV2, schemaFilaExposicionRutaV2,
  )
  return actualizarV2(mapeadasValidas, opts, 'exposicion-ruta-v2', lineas.length, fallidas)
}

/** Valida filas ya mapeadas (CSV) con el mismo reporte de fallidas que v1. */
function validarFilas(filas, schemaFila) {
  const validas = []
  let fallidas = 0
  for (const fila of filas) {
    const parseo = schemaFila.safeParse(fila)
    if (!parseo.success) {
      console.warn(
        `[importar-geo-static] fila invalida (${fila.cueAnexo ?? '?'}): ${formatearIssues(parseo.error)}`,
      )
      fallidas++
      continue
    }
    validas.push(parseo.data)
  }
  return { validas, fallidas }
}


const schemaRioDem = z.object({
  cueAnexo: z.string().min(1), versionJob: z.string().min(1),
  sueloM: z.number().finite().nullable(), nivelRioDemM: z.number().finite().nullable(),
  distanciaRioM: z.number().finite().nonnegative().nullable(), fuente: z.string().min(1),
  fechaCorrida: fechaIsoSchema, importadoEn: z.string(),
})
const candidatoRutaEvacuacionSchema = z.object({
  destinoCue: z.string().min(1),
  destinoNombre: z.string().min(1),
  distanciaM: z.number().finite().nonnegative(),
  ruta: z.object({
    type: z.literal('LineString'),
    coordinates: z.array(z.tuple([lonSchema, latSchema])).min(2),
  }),
})

const schemaFilaRutaEvacuacion = z.object({
  cueAnexo: z.string().min(1),
  versionJob: z.string().min(1),
  candidatos: z.array(candidatoRutaEvacuacionSchema),
  fechaExtractoOsm: fechaIsoSchema,
  licencia: z.string().min(1),
  importadoEn: z.string(),
})

function mapearFilaRutaEvacuacion(fila) {
  return {
    cueAnexo: fila.cue_anexo,
    versionJob: fila.version_job,
    candidatos: (fila.candidatos ?? []).map((c) => ({
      destinoCue: c.destino_cue,
      destinoNombre: c.destino_nombre,
      distanciaM: c.distancia_m,
      ruta: c.ruta,
    })),
    fechaExtractoOsm: fila.fecha_extracto_osm,
    licencia: fila.licencia,
    importadoEn: new Date().toISOString(),
  }
}

const contratos = {
  aislamiento: [mapearFilaAislamiento, schemaFilaAislamiento],
  susceptibilidad: [mapearFilaSusceptibilidad, schemaFilaSusceptibilidad],
  geometria: [mapearFilaGeometria, schemaFilaGeometria],
  'exposicion-ruta': [mapearFilaExposicionRuta, schemaFilaExposicionRuta],
  'ruta-evacuacion': [mapearFilaRutaEvacuacion, schemaFilaRutaEvacuacion],
  'inundacion-v2': [mapearFilaInundacionV2, schemaFilaInundacionV2],
  'exposicion-ruta-v2': [mapearFilaExposicionRutaV2, schemaFilaExposicionRutaV2],
  'exposicion-rio-dem': [(fila) => ({
    cueAnexo: fila.cue_anexo, versionJob: fila.version_job,
    sueloM: numeroONull(fila.suelo_m), nivelRioDemM: numeroONull(fila.nivel_rio_dem_m),
    distanciaRioM: numeroONull(fila.distancia_rio_m), fuente: fila.fuente,
    fechaCorrida: fila.fecha_corrida, importadoEn: new Date().toISOString(),
  }), schemaRioDem],
}
const csvTipos = new Set(['aislamiento', 'susceptibilidad', 'inundacion-v2', 'exposicion-rio-dem'])
export function validarFilasGeo(tipo, crudas) {
  if (!contratos[tipo] || !Array.isArray(crudas) || !crudas.length) throw new Error('Capa o resultados inválidos')
  const [mapear, schema] = contratos[tipo]
  const vistas = new Set()
  return crudas.map((fila) => {
    const normalizada = csvTipos.has(tipo) ? Object.fromEntries(Object.entries(fila).map(([k, v]) => [k,
      v == null ? '' : typeof v === 'boolean'
        ? (tipo === 'inundacion-v2' ? (v ? 'True' : 'False') : (v ? '1' : '0')) : String(v),
    ])) : { ...fila, version_job: String(fila.version_job) }
    const datos = schema.parse(mapear(normalizada))
    const clave = `${datos.cueAnexo}/${datos.versionJob ?? ''}`
    if (vistas.has(clave)) throw new Error(`Escuela duplicada: ${datos.cueAnexo}`)
    vistas.add(clave)
    return datos
  })
}

export async function proyectarFilasGeo(tipo, validas, { db, tablas }) {
  const tabla = tablas[tipo]
  if (!tabla) throw new Error('Capa desconocida')
  if (tipo === 'inundacion-v2' || tipo === 'exposicion-ruta-v2') {
    // La versión del algoritmo v2 no es la versión de la fila base. Se elige
    // una sola base por escuela; nunca se modifican versiones históricas.
    const bases = await db.select({ cue: tabla.cueAnexo, version: tabla.versionJob, fecha: tabla.importadoEn }).from(tabla)
    const elegidas = new Map()
    for (const base of bases) {
      const actual = elegidas.get(base.cue)
      if (!actual || Date.parse(base.fecha) > Date.parse(actual.fecha)
        || (base.fecha === actual.fecha && Number(base.version) > Number(actual.version))) elegidas.set(base.cue, base)
    }
    const actualizaciones = validas.map(({ cueAnexo, ...campos }) => {
      const base = elegidas.get(cueAnexo)
      if (!base) throw new Error(`No existe fila base para ${cueAnexo}`)
      return Object.fromEntries(Object.entries({ cueAnexo, versionJob: base.version, ...campos })
        .map(([campo, valor]) => [tabla[campo].name, valor]))
    })
    const campos = Object.keys(validas[0]).filter((campo) => campo !== 'cueAnexo')
    const asignaciones = campos.map((campo) => sql`${sql.identifier(tabla[campo].name)} = nuevo.${sql.identifier(tabla[campo].name)}`)
    for (let i = 0; i < actualizaciones.length; i += 200) await db.execute(sql`
      UPDATE ${tabla} SET ${sql.join(asignaciones, sql`, `)}
      FROM jsonb_populate_recordset(NULL::${tabla}, ${JSON.stringify(actualizaciones.slice(i, i + 200))}::jsonb) nuevo
      WHERE ${tabla.cueAnexo}=nuevo.cue_anexo AND ${tabla.versionJob}=nuevo.version_job`)

  } else {
    const campos = Object.keys(validas[0]).filter((campo) => !['cueAnexo', 'versionJob'].includes(campo))
    const set = Object.fromEntries(campos.map((campo) => [campo, sql`excluded.${sql.identifier(tabla[campo].name)}`]))
    for (let i = 0; i < validas.length; i += 200) await db.insert(tabla).values(validas.slice(i, i + 200))
      .onConflictDoUpdate({ target: [tabla.cueAnexo, tabla.versionJob], set })
  }
  return validas.length
}

export { leerCsv as leerCsvGeo, leerNdjsonGz as leerNdjsonGeo }
