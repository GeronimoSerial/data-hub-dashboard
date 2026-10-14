// Job de sync de precipitación observada por satélite (E3a, NASA GPM IMERG
// Early Run). A diferencia de los providers de `imerg.ts` —que son puros y no
// hacen red ni leen credenciales— este job sí orquesta las dos llamadas HTTP
// reales:
//   1. CMR (metadata) para elegir el gránulo más reciente.
//   2. OPeNDAP ASCII (subsetting server-side) del bbox de Corrientes.
//
// El token de NASA Earthdata NO se lee implícitamente de `process.env` dentro
// de esta función: llega como parámetro `earthdataToken`. El proceso que invoca
// este job en producción debe leer EARTHDATA_TOKEN de su propio entorno; este
// módulo nunca lo loguea ni lo persiste. Así los tests inyectan un token fake
// sin tocar variables de entorno. (El NOMBRE de esa env var también está
// declarado en CONFIG_FUENTES.imergCmr.envToken; su lectura sigue ocurriendo en
// el proceso que invoca el job, no acá.)
//
// Idempotencia en dos capas, igual que sync-pronostico-caudal.ts:
// 1. `infra_job_run`: la claveIdempotente es el bloque de 30 min UTC, que es la
//    ventana nativa de los gránulos IMERG Early Run (uno cada ~30 min). Dos
//    invocaciones dentro de la misma ventana compiten por el MISMO job run y
//    sólo una ejecuta.
// 2. `hazard_observation_uidx` (provider+variable+geometryRef+observadoEn): si
//    se vuelve a pedir el mismo gránulo, el upsert actualiza valor/ventana en
//    vez de duplicar. `observadoEn` se ancla al inicio del gránulo, no al reloj
//    de la invocación.
//
// Backfill de historia (MAJOR de la revisión de gate N1, docs/ejecucion-enos/
// E3a/registro.md §"Correcciones del gate N1"): para que
// `peligro/observado.ts` pueda sumar 24h/72h de lluvia por celda hace falta
// más que el último gránulo. Cada corrida pide con `temporal=` la ventana de
// las últimas `VENTANA_BACKFILL_HORAS` (72h) y completa, de forma acotada
// (`MAX_GRANULOS_A_PROCESAR_POR_CORRIDA`), los gránulos que todavía no están
// en `hazard_observation`. Es idempotente (mismo upsert por gránulo) y el
// costo por gránulo es ~6 KB (subset OPeNDAP ASCII de Corrientes), así que el
// presupuesto de la corrida está documentado en la constante de abajo.
//
// Una fuente caída o degradada NO tumba el job: se registra el estado en
// `hazard_source_health` y se libera el lease con contador 0 para no bloquear
// el próximo ciclo.
import { randomUUID } from 'node:crypto'
import { and, eq, gte, lte, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { conReintentoPorBloqueo } from '@/lib/db/reintento'
import { hazardObservation } from '@/lib/db/schema'
import { adquirirLease, publicarResultado } from '../job-run'
import { CONFIG_FUENTES } from '../providers/config-fuentes'
import { crearAdaptadorImerg } from '../adaptadores-ingesta/imerg'
import { actualizarSaludFuente } from './salud-fuente'
import type {
  GranuloSatelital,
  ObservacionPrecipitacionCelda,
  PuertoObservacionSatelital,
} from '../adaptadores-ingesta/puertos'

// Mismo literal que providers/imerg.ts (`unidad: 'mm/30min'`, ver
// `FACTOR_TASA_A_ACUMULADO_30MIN`): el puerto normalizado no expone `unidad`
// (siempre mm, ver ObservacionPrecipitacionCelda), así que el job la
// reconstituye acá para no cambiar el valor persistido en
// `hazard_observation.unidad`.
const UNIDAD_OBSERVADA = 'mm/30min'

const TIPO_JOB = 'sync-hazard-imerg'
const VERSION_JOB = 'v1'
const DURACION_LEASE_MS = 5 * 60 * 1000
// IMERG Early Run publica un gránulo cada 30 min con ~4 h de latencia. El TTL
// mide el tiempo desde la última corrida exitosa (job horario): 180 min tolera
// dos corridas demoradas o fallidas antes de marcar la fuente como vencida.
const TTL_MINUTOS = 180
const LICENCIA = 'NASA GPM IMERG — GES DISC, cuenta NASA Earthdata requerida'

const PROVIDER = 'nasa-imerg'
// Exportada (cambio aditivo) para que cualquier consulta de hazard_observation
// use el mismo literal de `variable`, sin duplicarlo a mano.
export const VARIABLE_OBSERVADA = 'precipitacion_observada_satelital'
const LARGO_MAX_ERROR = 300
const LARGO_MAX_RESUMEN_FALLOS = 500

// Mismo bug de clase que sync-pronostico-caudal.ts (ver su comentario junto a
// `TAMANO_CHUNK_INSERCION`): un único `insert(...).values(hugeArray)` hace que
// drizzle-orm arme el INSERT recorriendo recursivamente cada fila y puede
// reventar el stack con "RangeError: Maximum call stack size exceeded" antes
// de que SQLite valide el bind count. hazardObservation tiene 12 columnas;
// 500 filas = 6.000 binds, muy por debajo del límite de SQLite y de la
// profundidad de recursión que dispara el RangeError.
const TAMANO_CHUNK_INSERCION = 500

// Ventana de backfill: cubre el horizonte más largo que consume
// `peligro/observado.ts` (72h) más un margen chico para no perder cobertura
// por gránulos que llegaron tarde (latencia típica ~4h de Early Run).
const VENTANA_BACKFILL_HORAS = CONFIG_FUENTES.imergCmr.ventanaBackfillHoras
const MARGEN_BACKFILL_HORAS = CONFIG_FUENTES.imergCmr.margenBackfillHoras
// Presupuesto de la corrida: como mucho este número de gránulos NUEVOS se
// descargan (subset OPeNDAP, ~6 KB c/u) por invocación del job. El resto
// queda para la siguiente corrida (cada 30 min): en régimen estable alcanza
// con 1 (el gránulo nuevo); recién desplegado o tras una caída, varias
// corridas sucesivas completan la ventana de 72h (144 gránulos) sin
// disparar 144 requests de una sola vez.
const MAX_GRANULOS_A_PROCESAR_POR_CORRIDA = CONFIG_FUENTES.imergCmr.maxGranulosPorCorrida
// El armado de la URL de CMR (page_size, short_name, host) ya vive en
// `adaptadores-ingesta/imerg.ts` (`listarGranulos`), que usa el mismo
// `CONFIG_FUENTES.imergCmr`. Ver PENDIENTE resuelto en el adaptador.

type Db = ReturnType<typeof getDb>
type EstadoSalud = 'ok' | 'degradado' | 'no_disponible'

export type MotivoSyncImerg = 'sincronizado' | 'fuente_no_configurada' | 'sin_granulo_disponible'

export type ResultadoSyncImerg = {
  celdasActualizadas: number
  motivo: MotivoSyncImerg
  // Cuántos gránulos nuevos (del gránulo más reciente + backfill) se
  // procesaron con éxito en esta corrida; 0 cuando ya estaba todo al día.
  granulosProcesados: number
  // Cuántos gránulos de la ventana de backfill fallaron (HTTP/parseo) y
  // quedaron pendientes para la próxima corrida.
  granulosFallidos: number
}

// Extensión compatible del contrato de retorno: mismo estilo que el resto de
// los jobs (lease no disponible) más el caso en que la fuente no está
// configurada o no devuelve nada, que NO es una falla del job.
export type ResultadoEjecucionSyncImerg =
  | { ok: true; resultado: ResultadoSyncImerg }
  | { ok: false; motivo: 'lease_no_disponible' }

// Bloque de 30 min UTC: 00:00, 00:30, 01:00... que es la ventana nativa de los
// gránulos IMERG Early Run. Dos corridas dentro del mismo bloque comparten
// claveIdempotente y por lo tanto son la MISMA corrida.
function claveIdempotenteDeBloque(ahora: Date): string {
  const bloqueMinutos = Math.floor(ahora.getUTCMinutes() / 30) * 30
  const anio = ahora.getUTCFullYear()
  const mes = String(ahora.getUTCMonth() + 1).padStart(2, '0')
  const dia = String(ahora.getUTCDate()).padStart(2, '0')
  const hora = String(ahora.getUTCHours()).padStart(2, '0')
  const minuto = String(bloqueMinutos).padStart(2, '0')
  return `${anio}-${mes}-${dia}T${hora}:${minuto}`
}

// Nunca persistimos ni logueamos el token: además de no incluirlo en el
// mensaje, lo redactamos por si un error de fetch lo embebiera.
function sanearError(error: unknown, token: string): string {
  const bruto = error instanceof Error ? error.message : String(error)
  const sinToken = token.length > 0 ? bruto.split(token).join('[REDACTED]') : bruto
  return sinToken.slice(0, LARGO_MAX_ERROR)
}

// Motivo por gránulo fallido (P-2). Sólo se persisten la clase, el HTTP status
// y el sello del gránulo: nunca el cuerpo de respuesta, la URL ni headers. El
// adaptador sólo lanza `subset HTTP <status>` (sin URL ni token), así que el
// status se lee de ese mensaje fijo y cualquier otro error queda como `error`.
type ClaseFalloGranulo = 'no_publicado' | 'error'
type FalloGranulo = { granuloIso: string; clase: ClaseFalloGranulo; status: number | null }

function clasificarFalloGranulo(granulo: GranuloSatelital, error: unknown): FalloGranulo {
  const mensaje = error instanceof Error ? error.message : String(error)
  // `subset HTTP <status>` puede venir seguido de `; hdf5 ...` cuando hubo fallback.
  const coincidencia = /^subset HTTP (\d{3})\b/.exec(mensaje)
  if (coincidencia === null) {
    return { granuloIso: granulo.inicioEn, clase: 'error', status: null }
  }
  const status = Number(coincidencia[1])
  return {
    granuloIso: granulo.inicioEn,
    clase: status === 404 ? 'no_publicado' : 'error',
    status,
  }
}

// Resumen acotado para `infra_job_run.error_saneado`: `<granuloIso>: <clase> <status>`.
function resumirFallosGranulos(fallos: FalloGranulo[]): string | null {
  if (fallos.length === 0) return null
  const partes = fallos.map((fallo) => {
    const detalle = fallo.status === null ? fallo.clase : `${fallo.clase} ${fallo.status}`
    return `${fallo.granuloIso}: ${detalle}`
  })
  return partes.join('; ').slice(0, LARGO_MAX_RESUMEN_FALLOS)
}

async function actualizarSalud(
  db: Db,
  estado: EstadoSalud,
  ultimoErrorSaneado: string | null,
  ahoraIso: string,
): Promise<void> {
  // Upsert único: seguro de reintentar ante SQLITE_BUSY (job, no request
  // path), el statement no deja nada aplicado si no llega a correr.
  await actualizarSaludFuente(db, {
    provider: PROVIDER,
    ttlMinutos: TTL_MINUTOS,
    licencia: LICENCIA,
    estado,
    ultimoErrorSaneado,
    ahoraIso,
  })
}

// Deduplicación a nivel de todo el batch por `geometryRef`. `mapearAsciiImergACeldas`
// ya deduplica dentro de su propia salida, pero el contrato del job no depende
// de ese detalle: si la grilla IMERG (desfasada media celda respecto de
// `celdaDeCoordenada`) hace colisionar dos filas en la misma celda, nos
// quedamos con el PRIMER valor encontrado, igual que el mapeo.
function deduplicarPorCelda(
  puntos: ObservacionPrecipitacionCelda[],
): ObservacionPrecipitacionCelda[] {
  const vistas = new Set<string>()
  const unicos: ObservacionPrecipitacionCelda[] = []
  for (const punto of puntos) {
    if (vistas.has(punto.geometryRef)) continue
    vistas.add(punto.geometryRef)
    unicos.push(punto)
  }
  return unicos
}

// Gránulos de la ventana ya presentes en `hazard_observation`, identificados
// por `observadoEn` (el inicio del gránulo). Una sola fila de CUALQUIER celda
// alcanza para saber que ese gránulo ya se ingirió completo: `persistirObservaciones`
// escribe todas las celdas del subset en el mismo batch, nunca parcial.
async function obtenerObservadosEnExistentes(
  db: Db,
  desdeIso: string,
  hastaIso: string,
): Promise<Set<string>> {
  const filas = await db
    .selectDistinct({ observadoEn: hazardObservation.observadoEn })
    .from(hazardObservation)
    .where(
      and(
        eq(hazardObservation.provider, PROVIDER),
        eq(hazardObservation.variable, VARIABLE_OBSERVADA),
        gte(hazardObservation.observadoEn, desdeIso),
        lte(hazardObservation.observadoEn, hastaIso),
      ),
    )
  return new Set(filas.map((fila) => fila.observadoEn))
}

async function persistirObservaciones(
  db: Db,
  puntos: ObservacionPrecipitacionCelda[],
  ingeridoEn: string,
): Promise<number> {
  if (puntos.length === 0) return 0

  // Traducción de FORMA únicamente (nombres del puerto -> columnas de
  // `hazard_observation`): `valorMm`/`ventanaDesde`/`ventanaHasta` son los
  // mismos instantes/valor que antes exponían `valor`/`validoDesde`/
  // `validoHasta` (ver adaptadores-ingesta/imerg.ts). `unidad` no viaja en el
  // puerto porque siempre es la misma constante (ver UNIDAD_OBSERVADA arriba).
  const filas = puntos.map((punto) => ({
    id: randomUUID(),
    provider: PROVIDER,
    variable: punto.variable,
    geometryRef: punto.geometryRef,
    valor: punto.valorMm,
    unidad: UNIDAD_OBSERVADA,
    observadoEn: punto.observadoEn,
    validoDesde: punto.ventanaDesde,
    validoHasta: punto.ventanaHasta,
    calidad: punto.calidad,
    // Fuera del alcance de esta versión: no se conserva el ASCII crudo. Mismo
    // criterio que E2 dejó `rawRef` null para `hazard_forecast`.
    rawRef: null,
    ingeridoEn,
  }))

  // Ver comentario de `TAMANO_CHUNK_INSERCION`: nunca un solo `.values()` con
  // todas las filas, siempre en chunks dentro de una transacción.
  // Toda la transacción se reintenta ante SQLITE_BUSY: si falla, se revierte
  // completa y es seguro volver a correrla.
  await conReintentoPorBloqueo(() =>
    db.transaction(async (tx) => {
    for (let inicio = 0; inicio < filas.length; inicio += TAMANO_CHUNK_INSERCION) {
      const chunk = filas.slice(inicio, inicio + TAMANO_CHUNK_INSERCION)
      await tx
        .insert(hazardObservation)
        .values(chunk)
        .onConflictDoUpdate({
          target: [
            hazardObservation.provider,
            hazardObservation.variable,
            hazardObservation.geometryRef,
            hazardObservation.observadoEn,
          ],
          set: {
            valor: sql`excluded.valor`,
            unidad: sql`excluded.unidad`,
            validoDesde: sql`excluded.valido_desde`,
            validoHasta: sql`excluded.valido_hasta`,
            calidad: sql`excluded.calidad`,
            ingeridoEn: sql`excluded.ingerido_en`,
          },
        })
    }
    }),
  )

  return filas.length
}

// Descarga+parsea+persiste un único gránulo vía el puerto normalizado. Lanza
// (no atrapa) en cualquier falla de red/formato: el llamador decide qué hacer
// con ese gránulo puntual (abortar la corrida si es el más reciente, o
// descartarlo y seguir con el resto si es sólo backfill). El fetch+parseo
// (misma URL de subset, mismo armado de índices de grilla) ahora vive en
// `adaptadores-ingesta/imerg.ts` (`obtenerObservacion`).
async function procesarGranulo(
  db: Db,
  puerto: PuertoObservacionSatelital,
  granulo: GranuloSatelital,
  ingeridoEn: string,
): Promise<number> {
  const { observaciones } = await puerto.obtenerObservacion({ granulo })
  const unicos = deduplicarPorCelda(observaciones)
  return await persistirObservaciones(db, unicos, ingeridoEn)
}

/**
 * Elige los gránulos a procesar en una corrida. Primero el más reciente (mantiene
 * la frescura y la señal de salud), y el resto del presupuesto con los más viejos
 * faltantes: así un gránulo reciente que falla siempre no bloquea el backfill.
 */
export function seleccionarGranulosAProcesar<T extends { inicioEn: string }>(
  faltantes: readonly T[],
  presupuesto: number,
): T[] {
  if (faltantes.length === 0 || presupuesto <= 0) return []
  const porInicio = (a: T, b: T) => Date.parse(a.inicioEn) - Date.parse(b.inicioEn)
  const masReciente = [...faltantes].sort(porInicio).at(-1) as T
  const resto = faltantes.filter((g) => g !== masReciente).sort(porInicio)
  return [masReciente, ...resto].slice(0, presupuesto)
}

export async function ejecutarSyncImerg(params?: {
  ahora?: Date
  fetchImpl?: typeof fetch
  earthdataToken?: string
  // Seam de test: inyecta el PUERTO completo (sin red), saltea la
  // construcción del adaptador real. Demuestra la inyección por puerto (ver
  // sync-imerg.test.ts).
  puerto?: PuertoObservacionSatelital
}): Promise<ResultadoEjecucionSyncImerg> {
  const db = getDb()
  const ahora = params?.ahora ?? new Date()
  const ahoraIso = ahora.toISOString()
  const token = params?.earthdataToken

  // Fuente no configurada: comportamiento esperado mientras no exista la
  // cuenta NASA Earthdata. NO es una falla del job y NO se toca la red.
  if (token === undefined || token.trim() === '') {
    await actualizarSalud(db, 'no_disponible', 'fuente no configurada: falta EARTHDATA_TOKEN', ahoraIso)
    return {
      ok: true,
      resultado: {
        celdasActualizadas: 0,
        motivo: 'fuente_no_configurada',
        granulosProcesados: 0,
        granulosFallidos: 0,
      },
    }
  }

  const claveIdempotente = claveIdempotenteDeBloque(ahora)
  const lease = await adquirirLease({
    tipo: TIPO_JOB,
    claveIdempotente,
    version: VERSION_JOB,
    duracionLeaseMs: DURACION_LEASE_MS,
    ahora,
  })
  if (!lease.adquirido) {
    return { ok: false, motivo: 'lease_no_disponible' }
  }

  // Corrección de bug real (mismo hallazgo que sync-pronostico-caudal.ts): sin
  // este try/catch, cualquier excepción posterior a adquirir el lease escapa
  // sin publicar resultado y `infra_job_run` queda 'en_progreso' hasta que el
  // lease venza solo. Se envuelve todo el cuerpo para que un fallo siempre
  // marque 'fallido' antes de relanzar la excepción original.
  try {
    return await ejecutarCuerpoDelJobImerg({ db, ahora, ahoraIso, token, lease, params })
  } catch (error) {
    await publicarResultado({
      jobRunId: lease.jobRunId,
      leaseOwner: lease.leaseOwner,
      estado: 'fallido',
      errorSaneado: 'fallo al ejecutar sync-hazard-imerg',
      ahora,
    })
    throw error
  }
}

async function ejecutarCuerpoDelJobImerg(ctx: {
  db: Db
  ahora: Date
  ahoraIso: string
  token: string
  lease: { adquirido: true; jobRunId: string; leaseOwner: string }
  params?: {
    ahora?: Date
    fetchImpl?: typeof fetch
    earthdataToken?: string
    puerto?: PuertoObservacionSatelital
  }
}): Promise<ResultadoEjecucionSyncImerg> {
  const { db, ahora, ahoraIso, token, lease, params } = ctx

  // Puerto normalizado (ABS1, segunda parte): por defecto el adaptador real,
  // que envuelve el mismo fetch+parseo de CMR/OPeNDAP que antes vivía inline
  // acá, sin cambiar ninguna URL ni valor. `token` ya viene validado (no
  // vacío) por el chequeo de `fuente_no_configurada` de arriba, así que se
  // pasa explícito para que el adaptador nunca dependa del fallback a
  // `process.env.EARTHDATA_TOKEN`.
  const puerto: PuertoObservacionSatelital =
    params?.puerto ?? crearAdaptadorImerg({ fetchImpl: params?.fetchImpl, token })

  // Una fuente caída no debe bloquear el lease para el próximo ciclo: se
  // registra degradado y se publica `completado` con contador 0.
  const degradar = async (
    motivo: MotivoSyncImerg,
    errorSaneado: string,
  ): Promise<ResultadoEjecucionSyncImerg> => {
    await actualizarSalud(db, 'degradado', errorSaneado.slice(0, LARGO_MAX_ERROR), ahoraIso)
    await publicarResultado({
      jobRunId: lease.jobRunId,
      leaseOwner: lease.leaseOwner,
      estado: 'completado',
      contadores: { celdasActualizadas: 0 },
      ahora,
    })
    return {
      ok: true,
      resultado: { celdasActualizadas: 0, motivo, granulosProcesados: 0, granulosFallidos: 0 },
    }
  }

  // 1. Listar los gránulos de la ventana de backfill (72h + margen) vía CMR.
  // El primero (sort_key=-start_date) es el "más reciente"; si falla ESE
  // gránulo puntual, la corrida entera se trata como degradada (mismo
  // comportamiento que antes del backfill). Los demás son candidatos a
  // backfill: si alguno falla, se descarta y se reintenta en la próxima
  // corrida (no aborta el resto).
  const desdeVentana = new Date(ahora.getTime() - (VENTANA_BACKFILL_HORAS + MARGEN_BACKFILL_HORAS) * 60 * 60 * 1000)
  let granulos: GranuloSatelital[]
  try {
    // El puerto ya valida `.ok` y lanza `CMR HTTP ${status}` (mismo texto que
    // antes armaba el job a mano); `sanearError` deja ese mensaje intacto
    // (sin token adentro) y cualquier otra falla de red/parseo cae en la
    // misma rama, igual que antes.
    granulos = await puerto.listarGranulos({
      desde: desdeVentana.toISOString(),
      hasta: ahora.toISOString(),
    })
  } catch (error) {
    return await degradar('sin_granulo_disponible', sanearError(error, token))
  }
  if (granulos.length === 0) {
    return await degradar('sin_granulo_disponible', 'CMR no devolvió ningún gránulo de datos')
  }

  // 2. Descartar los gránulos ya ingeridos (por `observadoEn`) y acotar el
  // resto al presupuesto de la corrida: el más reciente primero y el resto del
  // presupuesto con los más viejos faltantes (ver `seleccionarGranulosAProcesar`).
  const yaIngeridos = await obtenerObservadosEnExistentes(
    db,
    desdeVentana.toISOString(),
    ahora.toISOString(),
  )
  const faltantes = granulos.filter((g) => !yaIngeridos.has(g.inicioEn))
  const granuloMasReciente = granulos[0]
  const aProcesar = seleccionarGranulosAProcesar(faltantes, MAX_GRANULOS_A_PROCESAR_POR_CORRIDA)

  if (aProcesar.length === 0) {
    // Ya está todo al día (incluido el gránulo más reciente): no hay red que
    // pedir además del listado de CMR ya hecho arriba.
    await actualizarSalud(db, 'ok', null, ahoraIso)
    await publicarResultado({
      jobRunId: lease.jobRunId,
      leaseOwner: lease.leaseOwner,
      estado: 'completado',
      contadores: { celdasActualizadas: 0 },
      ahora,
    })
    return {
      ok: true,
      resultado: { celdasActualizadas: 0, motivo: 'sincronizado', granulosProcesados: 0, granulosFallidos: 0 },
    }
  }

  let celdasActualizadas = 0
  let granulosProcesados = 0
  let granulosFallidos = 0
  let errorMasRecienteSaneado: string | null = null
  let claseMasReciente: ClaseFalloGranulo | null = null
  const fallos: FalloGranulo[] = []

  for (const granulo of aProcesar) {
    try {
      celdasActualizadas += await procesarGranulo(db, puerto, granulo, ahoraIso)
      granulosProcesados += 1
    } catch (error) {
      granulosFallidos += 1
      const saneado = sanearError(error, token)
      const fallo = clasificarFalloGranulo(granulo, error)
      fallos.push(fallo)
      // Si el que falla es el gránulo más reciente, es lo que antes se
      // reportaba como el estado de salud de la fuente: se conserva ese
      // mensaje aunque haya backfill exitoso alrededor.
      if (granulo.inicioEn === granuloMasReciente.inicioEn) {
        errorMasRecienteSaneado = saneado
        claseMasReciente = fallo.clase
      }
    }
  }

  // El gránulo más reciente manda el estado de salud: si falló (o directamente
  // no estaba entre los `aProcesar`, cosa que no puede pasar salvo que ya
  // estuviera ingerido), la fuente se reporta degradada aunque el backfill de
  // gránulos viejos haya sido parcialmente exitoso. Un gránulo no publicado
  // (404) todavía no es una falla de la fuente: es latencia de publicación, así
  // que sólo degrada un error real.
  const fallóElMasReciente = errorMasRecienteSaneado !== null
  const degradaFuente = fallóElMasReciente && claseMasReciente === 'error'
  await actualizarSalud(
    db,
    degradaFuente ? 'degradado' : 'ok',
    degradaFuente ? errorMasRecienteSaneado : null,
    ahoraIso,
  )
  const granulosNoPublicados = fallos.filter((fallo) => fallo.clase === 'no_publicado').length
  const granulosConError = fallos.length - granulosNoPublicados
  await publicarResultado({
    jobRunId: lease.jobRunId,
    leaseOwner: lease.leaseOwner,
    estado: 'completado',
    contadores: {
      celdasActualizadas,
      granulosProcesados,
      granulosFallidos,
      granulosNoPublicados,
      granulosConError,
    },
    errorSaneado: resumirFallosGranulos(fallos) ?? undefined,
    ahora,
  })

  const motivo: MotivoSyncImerg = fallóElMasReciente && granulosProcesados === 0
    ? 'sin_granulo_disponible'
    : 'sincronizado'

  return {
    ok: true,
    resultado: { celdasActualizadas, motivo, granulosProcesados, granulosFallidos },
  }
}
