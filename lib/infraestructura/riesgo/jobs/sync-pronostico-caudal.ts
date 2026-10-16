import { cargarReferencias } from '@/lib/infraestructura/datasets/repositorio'
// Job de sync de pronóstico hidrometeorológico (E2): junta las celdas únicas
// con perfil geográfico válido (ECMWF) y los puntos de río curados (caudal
// GloFAS/Flood) y persiste ambos en `hazard_forecast`, actualizando además la
// salud por proveedor en `hazard_source_health`.
//
// Idempotencia en dos capas:
// 1. `infra_job_run` (ver job-run.ts): la claveIdempotente es el bloque de 6h
//    UTC, así dos invocaciones dentro de la misma ventana compiten por el
//    MISMO job run y sólo una lo ejecuta. Repetir el sync no re-consulta ni
//    re-escribe.
// 2. `hazard_forecast_uidx` (provider+variable+geometryRef+corridaEn+validoEn):
//    si por alguna razón se vuelven a pedir los mismos puntos de la misma
//    corrida, el upsert actualiza valor/unidad/pasoHoras/ingeridoEn en vez de
//    duplicar.
//
// Una fuente degradada NO tumba el job: cada proveedor reporta los errores por
// celda/punto y el sync completa igual; el estado queda reflejado en
// `hazard_source_health`.
import { randomUUID } from 'node:crypto'
import { isNotNull, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { conReintentoPorBloqueo } from '@/lib/db/reintento'
import { hazardForecast, infraGeoProfile } from '@/lib/db/schema'
import { obtenerPuntosRio } from '../puntos-rio'
import { crearProviderEcmwf } from '../providers/ecmwf'
import {
  crearProviderFlood,
  obtenerPronosticoConDiagnostico as pronosticoFloodConDiagnostico,
} from '../providers/flood'
import { apiKeyDesdeEntorno, crearControladorCupo } from '../providers/cupo-om'
import type { HazardForecastPunto } from '../tipos-hazard'
import {
  adquirirLease,
  claveIdempotenteDeBloque6h,
  inicioDeBloqueUtc,
  publicarResultado,
  renovarLease as renovarLeaseReal,
} from '../job-run'
import { actualizarSaludFuente, resumirErrores } from './salud-fuente'
import { insertarPorChunks } from './chunks'

// Ambigüedad resuelta: el contrato `HazardProvider` de tipos-hazard.ts sólo
// declara `obtenerPronostico`; el método con diagnóstico por celda lo agrega
// `HazardProviderEcmwf` y, en flood.ts, vive como función suelta (la factory
// `crearProviderFlood()` no lo expone). No podemos tocar esos archivos en este
// cambio, así que el job depende de esta interfaz estructural mínima. Los
// providers reales la satisfacen y los tests pueden inyectar fakes sin red.
export interface ProveedorConDiagnostico {
  readonly nombreProveedor: string
  obtenerPronosticoConDiagnostico(params: {
    geometryRefs: string[]
    ahora: Date
  }): Promise<{
    puntos: HazardForecastPunto[]
    erroresPorCelda: Record<string, string>
    // Corrección de revisión (hallazgo B): opcional para no romper un fake de
    // test más viejo que no lo declare; si falta, el job asume 1 request por
    // geometryRef pedido (comportamiento previo, conservador pero potencialmente
    // inflado si el provider en realidad batchea).
    llamadasRealizadas?: number
  }>
}

export type ResultadoSyncPronosticoCaudal = {
  celdasConsultadas: number
  puntosRioConsultados: number
  llamadasRealizadas: number
  filasInsertadas: number
  proveedoresConError: string[]
}

// Extensión compatible del contrato de retorno: se agrega el caso en que el
// job perdió el lease durante la ejecución (otro proceso lo recuperó). Conserva
// `ok:false` y el estilo de `motivo` ya usado por `lease_no_disponible`, y
// adjunta el parcial procesado hasta el corte para observabilidad.
export type ResultadoEjecucionSyncPronosticoCaudal =
  | { ok: true; resultado: ResultadoSyncPronosticoCaudal }
  | { ok: false; motivo: 'lease_no_disponible' }
  | {
      ok: false
      motivo: 'lease_perdido_durante_ejecucion'
      resultado: ResultadoSyncPronosticoCaudal
    }

const TIPO_JOB = 'sync-hazard-pronostico-caudal'
const VERSION_JOB = 'v1'
const DURACION_LEASE_MS = 5 * 60 * 1000
// Renovación activa del lease durante el loop de consultas (hallazgo H2 del
// batch E2): con ~387 celdas reales la fase de consultas puede durar más que
// los 5 min del lease, y otra invocación recuperaría el lease vencido y
// correría en paralelo. En vez de agrandar estáticamente el lease, procesamos
// las consultas en tandas de `RENOVAR_LEASE_CADA_N_CELDAS` y renovamos después
// de cada tanda que todavía tenga trabajo por delante. Por qué 25: cada celda
// es una consulta HTTP que en el peor caso razonable ronda unos pocos
// segundos, así que una tanda de 25 celdas queda en el orden de ~25-125s,
// holgadamente por debajo de los 300s del lease; con ~387 celdas eso da ~16
// renovaciones, overhead despreciable frente a las consultas. El bloque de
// puntos de río usa el mismo tamaño de tanda porque es la misma clase de
// invocación al provider.
const RENOVAR_LEASE_CADA_N_CELDAS = 25
const TTL_MINUTOS = 360
const LICENCIA = 'CC-BY 4.0 no comercial — Open-Meteo + ECMWF, nivel gratuito'
const LARGO_MAX_ERROR = 300

// Corrección de bug real (corrida local contra DB de dev, ~387 celdas x ~240
// pasos horarios x varias variables): un único `insert(hazardForecast)
// .values(hugeArray)` con decenas de miles de filas hace que drizzle-orm
// arme el INSERT recorriendo recursivamente cada fila (`mergeQueries` en
// drizzle-orm/sql/sql.ts) y revienta el stack con "RangeError: Maximum call
// stack size exceeded" ANTES de que SQLite llegue siquiera a validar la
// cantidad de binds. Confirmado con un repro: una sola sentencia con 10.000
// filas ya falla por límite de variables de SQLite (error normal, catcheable)
// y con 15.000+ filas el RangeError aparece de forma síncrona-en-microtask,
// escapando cualquier catch que envuelva sólo el `await`. hazardForecast
// tiene 12 columnas; 500 filas = 6.000 binds, muy por debajo del límite de
// SQLite (32766 en builds recientes, 999 en viejos) y de la profundidad de
// recursión que dispara el RangeError. Se trocea dentro de una transacción
// para que la escritura de una tanda completa siga siendo atómica.
const TAMANO_CHUNK_INSERCION = 500

type Db = ReturnType<typeof getDb>

// La factory de flood no expone el diagnóstico por punto; se lo agregamos
// apoyándonos en la función suelta que ella misma usa internamente.
function crearProviderFloodConDiagnostico(opts: {
  db: Db
  apiKey: string | undefined
}): ProveedorConDiagnostico {
  const base = crearProviderFlood()
  return {
    nombreProveedor: base.nombreProveedor,
    obtenerPronosticoConDiagnostico: (params) =>
      pronosticoFloodConDiagnostico({
        ...params,
        apiKey: opts.apiKey,
        controladorCupoFactory: (peso) =>
          crearControladorCupo({ host: 'flood-api', peso, apiKeyPresente: Boolean(opts.apiKey), db: opts.db }),
      }),
  }
}

// Un proveedor que lanza (no sólo que reporta errores por celda) no debe
// tumbar el job: se traduce a error en todas sus celdas y se sigue.
async function consultarProveedor(
  provider: ProveedorConDiagnostico,
  geometryRefs: string[],
  ahora: Date,
): Promise<{
  puntos: HazardForecastPunto[]
  erroresPorCelda: Record<string, string>
  llamadasRealizadas: number
}> {
  try {
    const resultado = await provider.obtenerPronosticoConDiagnostico({ geometryRefs, ahora })
    // Fallback conservador si el provider no reporta su conteo real (ver
    // comentario del campo opcional en `ProveedorConDiagnostico`).
    return { ...resultado, llamadasRealizadas: resultado.llamadasRealizadas ?? geometryRefs.length }
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error)
    const erroresPorCelda: Record<string, string> = {}
    for (const ref of geometryRefs) {
      erroresPorCelda[ref] = `proveedor_throw: ${mensaje}`
    }
    // Un throw no permite saber cuántas requests HTTP reales se dispararon
    // antes de fallar: 0 es la aproximación conservadora (no infla el conteo).
    return { puntos: [], erroresPorCelda, llamadasRealizadas: 0 }
  }
}

async function persistirPuntos(
  db: Db,
  provider: string,
  puntos: HazardForecastPunto[],
  ingeridoEn: string,
): Promise<number> {
  if (puntos.length === 0) return 0

  const filas = puntos.map((punto) => ({
    id: randomUUID(),
    provider,
    variable: punto.variable,
    geometryRef: punto.geometryRef,
    corridaEn: punto.corridaEn,
    validoEn: punto.validoEn,
    horizonteHoras: punto.horizonteHoras,
    valor: punto.valor,
    unidad: punto.unidad,
    pasoHoras: punto.pasoHoras,
    // En producción acá se escribiría el payload crudo bajo
    // getDataDir()+'/hazard-raw/' y se guardaría su ruta. Fuera del alcance de
    // esta tarea: rawRef queda null y no se conserva el archivo.
    rawRef: null,
    ingeridoEn,
  }))

  // Ver comentario de `TAMANO_CHUNK_INSERCION`: nunca un solo `.values()` con
  // todas las filas de la tanda, siempre en chunks dentro de una transacción.
  // Toda la transacción se reintenta ante SQLITE_BUSY: si falla, se revierte
  // completa y es seguro volver a correrla.
  await conReintentoPorBloqueo(() =>
    db.transaction(async (tx) => {
      await insertarPorChunks(filas, TAMANO_CHUNK_INSERCION, (chunk) =>
        tx
          .insert(hazardForecast)
          .values(chunk)
          .onConflictDoUpdate({
            target: [
              hazardForecast.provider,
              hazardForecast.variable,
              hazardForecast.geometryRef,
              hazardForecast.corridaEn,
              hazardForecast.validoEn,
            ],
            set: {
              valor: sql`excluded.valor`,
              unidad: sql`excluded.unidad`,
              pasoHoras: sql`excluded.paso_horas`,
              ingeridoEn: sql`excluded.ingerido_en`,
            },
          }),
      )
    }),
  )

  return filas.length
}

async function actualizarSalud(
  db: Db,
  provider: string,
  erroresPorCelda: Record<string, string>,
  ahoraIso: string,
): Promise<void> {
  // Upsert único: mismo motivo de reintento que persistirPuntos.
  await actualizarSaludFuente(db, {
    provider,
    ttlMinutos: TTL_MINUTOS,
    licencia: LICENCIA,
    ...resumirErrores(erroresPorCelda, LARGO_MAX_ERROR),
    ahoraIso,
  })
}

export async function ejecutarSyncPronosticoCaudal(params?: {
  ahora?: Date
  ecmwfProvider?: ProveedorConDiagnostico
  floodProvider?: ProveedorConDiagnostico
  // Seam de test: permite inyectar un `renovarLease` fake sin mockear todo el
  // módulo job-run (que además aporta adquirirLease/publicarResultado).
  renovarLease?: typeof renovarLeaseReal
}): Promise<ResultadoEjecucionSyncPronosticoCaudal> {
  await cargarReferencias()
  const db = getDb()
  const ahora = params?.ahora ?? new Date()
  const ahoraIso = ahora.toISOString()

  const claveIdempotente = claveIdempotenteDeBloque6h(ahora)
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

  // Corrección de bug real: antes de este cambio no había ningún try/catch
  // acá abajo, así que CUALQUIER excepción posterior a adquirir el lease
  // (el RangeError de `persistirPuntos` con volumen real, o cualquier otra)
  // escapaba sin publicar resultado, y `infra_job_run` quedaba 'en_progreso'
  // hasta que el lease venciera solo. Se envuelve todo el cuerpo (mismo
  // patrón que calcular-riesgo.ts) para que un fallo siempre marque
  // 'fallido' antes de relanzar la excepción original.
  try {
    return await ejecutarCuerpoDelJob({
      db,
      ahora,
      ahoraIso,
      lease,
      params,
      inicioBloque: inicioDeBloqueUtc(ahora),
    })
  } catch (error) {
    await publicarResultado({
      jobRunId: lease.jobRunId,
      leaseOwner: lease.leaseOwner,
      estado: 'fallido',
      // Mensaje corto y sin datos nominales; el error original se relanza
      // para quien invoque el job (logs, tests) y no queda enmascarado.
      errorSaneado: 'fallo al ejecutar sync-hazard-pronostico-caudal',
      ahora,
    })
    throw error
  }
}

async function ejecutarCuerpoDelJob(ctx: {
  db: Db
  ahora: Date
  ahoraIso: string
  lease: { adquirido: true; jobRunId: string; leaseOwner: string }
  params?: {
    ahora?: Date
    ecmwfProvider?: ProveedorConDiagnostico
    floodProvider?: ProveedorConDiagnostico
    renovarLease?: typeof renovarLeaseReal
  }
  inicioBloque: Date
}): Promise<ResultadoEjecucionSyncPronosticoCaudal> {
  const { db, ahora, ahoraIso, lease, params, inicioBloque } = ctx

  // El selectDistinct ya entrega las celdas deduplicadas: geo-perfil.ts agrupó
  // por celdaDeCoordenada al calcular el perfil, así que acá no hace falta
  // volver a agrupar.
  const filasGeo = await db
    .selectDistinct({ geometryRef: infraGeoProfile.geometryRef })
    .from(infraGeoProfile)
    .where(isNotNull(infraGeoProfile.geometryRef))
  const celdas = filasGeo
    .map((fila) => fila.geometryRef)
    .filter((ref): ref is string => ref !== null)

  const puntosRio = obtenerPuntosRio().map((punto) => punto.id)

  const apiKey = apiKeyDesdeEntorno()
  const ecmwfProvider =
    params?.ecmwfProvider ??
    crearProviderEcmwf({
      apiKey,
      controladorCupoFactory: (peso) =>
        crearControladorCupo({ host: 'api', peso, apiKeyPresente: Boolean(apiKey), db }),
    })
  const floodProvider = params?.floodProvider ?? crearProviderFloodConDiagnostico({ db, apiKey })

  // `corridaEn` (dentro de los providers) se deriva de `inicioBloque`, no del
  // wall-clock `ahora` — ver comentario de `inicioDeBloqueUtc` (calculado por
  // el caller y recibido en `ctx`).
  const renovar = params?.renovarLease ?? renovarLeaseReal

  // Armar las tandas de consulta: todo el trabajo de proveedor (celdas ECMWF y
  // puntos de río) se agrupa de a `RENOVAR_LEASE_CADA_N_CELDAS` para poder
  // renovar el lease entre tandas. Persistimos cada tanda en cuanto llega: si
  // el lease se pierde, no seguimos escribiendo filas de `hazard_forecast`.
  const tandas: Array<{ provider: ProveedorConDiagnostico; refs: string[]; esCeldas: boolean }> =
    []
  for (let indice = 0; indice < celdas.length; indice += RENOVAR_LEASE_CADA_N_CELDAS) {
    tandas.push({
      provider: ecmwfProvider,
      refs: celdas.slice(indice, indice + RENOVAR_LEASE_CADA_N_CELDAS),
      esCeldas: true,
    })
  }
  for (let indice = 0; indice < puntosRio.length; indice += RENOVAR_LEASE_CADA_N_CELDAS) {
    tandas.push({
      provider: floodProvider,
      refs: puntosRio.slice(indice, indice + RENOVAR_LEASE_CADA_N_CELDAS),
      esCeldas: false,
    })
  }

  const erroresEcmwf: Record<string, string> = {}
  const erroresFlood: Record<string, string> = {}
  let celdasConsultadas = 0
  let puntosRioConsultados = 0
  let filasInsertadas = 0
  // Corrección de revisión (hallazgo B): desde que ecmwf.ts batchea varias
  // celdas en una sola request HTTP, "una llamada por celda/punto consultado"
  // ya no es el conteo real. Se suma lo que cada provider reporta haber
  // disparado de verdad (`consultarProveedor` ya rellena un fallback si el
  // provider no lo expone).
  let llamadasReales = 0
  let leasePerdido = false

  for (let indice = 0; indice < tandas.length; indice++) {
    const tanda = tandas[indice]
    const diagnostico = await consultarProveedor(tanda.provider, tanda.refs, inicioBloque)
    Object.assign(tanda.esCeldas ? erroresEcmwf : erroresFlood, diagnostico.erroresPorCelda)
    filasInsertadas += await persistirPuntos(
      db,
      tanda.provider.nombreProveedor,
      diagnostico.puntos,
      ahoraIso,
    )
    if (tanda.esCeldas) celdasConsultadas += tanda.refs.length
    else puntosRioConsultados += tanda.refs.length
    llamadasReales += diagnostico.llamadasRealizadas

    // La última tanda ya no tiene trabajo posterior que proteger: no renovamos
    // después de ella.
    if (indice >= tandas.length - 1) continue

    // Fencing: renovamos SÓLO si seguimos siendo el owner. Si devuelve `false`,
    // otro proceso recuperó el lease: cortamos el loop sin consultar ni
    // escribir más. No publicamos resultado porque `publicarResultado` también
    // fallaría el fencing y el nuevo owner es quien manda.
    // Nota: NO pasamos el `ahora` anclado al inicio del job. Con ese valor,
    // `leaseExpiraEn` volvería a quedar en `inicio + duracion` (el mismo valor
    // de la adquisición inicial) y la renovación no extendería el lease; sin
    // `ahora`, `renovarLease` usa el reloj actual y sí corre el vencimiento.
    const renovado = await renovar({
      jobRunId: lease.jobRunId,
      leaseOwner: lease.leaseOwner,
      duracionLeaseMs: DURACION_LEASE_MS,
    })
    if (!renovado) {
      leasePerdido = true
      break
    }
  }

  const proveedoresConError: string[] = []
  if (Object.keys(erroresEcmwf).length > 0) proveedoresConError.push(ecmwfProvider.nombreProveedor)
  if (Object.keys(erroresFlood).length > 0) proveedoresConError.push(floodProvider.nombreProveedor)

  // Conteo real de requests HTTP disparadas (no de celdas/puntos consultados):
  // ecmwf.ts agrupa hasta 50 coordenadas por request, así que "una por celda"
  // ya no aplica desde el batching de este batch. Los adapters pueden
  // reintentar internamente (backoff/429), pero ese detalle queda encapsulado
  // en cliente-http.ts; acá contamos la unidad de consulta del job.
  const resultado: ResultadoSyncPronosticoCaudal = {
    celdasConsultadas,
    puntosRioConsultados,
    llamadasRealizadas: llamadasReales,
    filasInsertadas,
    proveedoresConError,
  }

  if (leasePerdido) {
    return { ok: false, motivo: 'lease_perdido_durante_ejecucion', resultado }
  }

  await actualizarSalud(db, ecmwfProvider.nombreProveedor, erroresEcmwf, ahoraIso)
  await actualizarSalud(db, floodProvider.nombreProveedor, erroresFlood, ahoraIso)

  await publicarResultado({
    jobRunId: lease.jobRunId,
    leaseOwner: lease.leaseOwner,
    estado: 'completado',
    contadores: { llamadas: resultado.llamadasRealizadas, filas: filasInsertadas },
    ahora,
  })

  return { ok: true, resultado }
}
