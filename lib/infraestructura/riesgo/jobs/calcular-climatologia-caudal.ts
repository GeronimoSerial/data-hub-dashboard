import { cargarReferencias } from '@/lib/infraestructura/datasets/repositorio'
// Job de cálculo de climatología de caudal (E3a): recorre los puntos fijos de
// río (`obtenerPuntosRio()`), pide a Open-Meteo Flood API (GloFAS) la serie histórica
// diaria de cada uno y persiste los percentiles p90/p95/p99 calculados en
// `hazard_climatology`. No es un sync periódico: es un cálculo offline y bajo
// demanda sobre una ventana histórica fija.
//
// Es la contraparte de caudal de `calcular-climatologia.ts` (precipitación),
// deliberadamente en un archivo separado: distinta variable, distinto endpoint
// y distinta fuente de puntos (ids de `obtenerPuntosRio()`, no celdas de
// `infra_geo_profile`).
//
// Período histórico elegido para GloFAS: 2015-01-01 a 2024-12-31. GloFAS
// reanalysis no expone una ventana tan larga como ERA5 (que llega a 1991), así
// que se usa un período de ~10 años completo y documentado en lugar de asumir
// disponibilidad de 1991. Si la fuente no devuelve dato para ese rango, el
// punto cae en `puntosConError` sin romper el job.
//
// Idempotencia en dos capas:
// 1. `infra_job_run` (ver job-run.ts): la claveIdempotente combina
//    período+versión; recalcular el MISMO período y versión es una sola
//    corrida, mientras que cambiar la versión permite recalcular sin pisar la
//    anterior.
// 2. `hazard_climatology_uidx`
//    (geometryRef+variable+percentil+muestra+periodoDesde+periodoHasta+version):
//    si se vuelven a calcular las mismas filas, el upsert actualiza
//    valor/unidad/calculadoEn en vez de duplicar.
//
// No se renueva el lease: son sólo 8 puntos, una llamada por punto, muy por
// debajo de la duración del lease. Un punto caído NO tumba el job: se agrega a
// `puntosConError` y se sigue con el próximo; un corte de la guarda de cupo
// (motivo "sin red") deja el resto pendiente sin gastar más llamadas.
//
// Cursor resumable: los puntos con p90/p95/p99 ya guardados para el mismo
// período y versión no se vuelven a pedir (`puntosYaCompletos`).
//
// Estado final (P-1, evitar éxito sin datos):
// - Mientras quede algún punto sin climatología, `infra_job_run` queda
//   'fallido' con `errorSaneado` = "<puntoId>: <motivo>" por punto pendiente
//   (acotado a 500 caracteres) y la misma clave es reintentable.
// - Con todos los puntos completos queda 'completado'.
import { randomUUID } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { conReintentoPorBloqueo } from '@/lib/db/reintento'
import { hazardClimatology } from '@/lib/db/schema'
import { adquirirLease, publicarResultado } from '../job-run'
import { obtenerPuntosRio } from '../puntos-rio'
import {
  calcularPercentilesCaudal,
  obtenerSeriesHistoricasCaudal,
} from '../providers/climatologia-caudal'
import { apiKeyDesdeEntorno, crearControladorCupo, MOTIVOS_CUPO_SIN_RED } from '../providers/cupo-om'

export type ResultadoCalcularClimatologiaCaudal = {
  puntosProcesados: number
  filasInsertadas: number
  puntosConError: string[]
  /** Puntos que ya tenían climatología completa y no se volvieron a pedir. */
  puntosYaCompletos: number
}

const TIPO_JOB = 'calcular-hazard-climatologia-caudal'
const DURACION_LEASE_MS = 10 * 60 * 1000
const PERIODO_DESDE_DEFAULT = '2015-01-01'
const PERIODO_HASTA_DEFAULT = '2024-12-31'
const VERSION_DEFAULT = 'caudal-climatologia-v0.1'
const LARGO_MAX_ERROR = 500
const VARIABLE_CAUDAL = 'caudal_diario'
const MUESTRA_CAUDAL = 'todos_los_dias'
const PERCENTILES_CAUDAL = ['p90', 'p95', 'p99'] as const

export async function ejecutarCalculoClimatologiaCaudal(params?: {
  ahora?: Date
  periodoDesde?: string
  periodoHasta?: string
  version?: string
  obtenerSeries?: typeof obtenerSeriesHistoricasCaudal
}): Promise<
  | { ok: true; resultado: ResultadoCalcularClimatologiaCaudal }
  | { ok: false; motivo: 'lease_no_disponible' }
> {
  await cargarReferencias()
  const db = getDb()
  const ahora = params?.ahora ?? new Date()
  const ahoraIso = ahora.toISOString()
  const periodoDesde = params?.periodoDesde ?? PERIODO_DESDE_DEFAULT
  const periodoHasta = params?.periodoHasta ?? PERIODO_HASTA_DEFAULT
  const version = params?.version ?? VERSION_DEFAULT
  const obtenerSeries = params?.obtenerSeries ?? obtenerSeriesHistoricasCaudal

  const claveIdempotente = `${periodoDesde}_${periodoHasta}_${version}`
  const lease = await adquirirLease({
    tipo: TIPO_JOB,
    claveIdempotente,
    version,
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
    return await ejecutarCuerpoDelJobClimatologiaCaudal({
      db,
      ahora,
      ahoraIso,
      periodoDesde,
      periodoHasta,
      version,
      obtenerSeries,
      lease,
    })
  } catch (error) {
    await publicarResultado({
      jobRunId: lease.jobRunId,
      leaseOwner: lease.leaseOwner,
      estado: 'fallido',
      errorSaneado: 'fallo al ejecutar calcular-hazard-climatologia-caudal',
      ahora,
    })
    throw error
  }
}

async function ejecutarCuerpoDelJobClimatologiaCaudal(ctx: {
  db: ReturnType<typeof getDb>
  ahora: Date
  ahoraIso: string
  periodoDesde: string
  periodoHasta: string
  version: string
  obtenerSeries: typeof obtenerSeriesHistoricasCaudal
  lease: { adquirido: true; jobRunId: string; leaseOwner: string }
}): Promise<
  | { ok: true; resultado: ResultadoCalcularClimatologiaCaudal }
  | { ok: false; motivo: 'lease_no_disponible' }
> {
  const { db, ahora, ahoraIso, periodoDesde, periodoHasta, version, obtenerSeries, lease } = ctx

  // Cursor resumable (cupo diario compartido de Open-Meteo): los puntos que ya
  // tienen los tres percentiles para este período+versión no se vuelven a
  // pedir. Cada punto pendiente se pide en su propia llamada y se persiste
  // apenas responde, así el avance de una corrida sobrevive aunque el resto se
  // quede sin cupo. Pedir los 8 puntos en un solo lote exigía ~2.087 unidades
  // de cupo en el mismo día (todo o nada) y el job no completaba nunca.
  const apiKey = apiKeyDesdeEntorno()
  const completos = await puntosConClimatologiaCompleta(db, { periodoDesde, periodoHasta, version })
  const puntos = obtenerPuntosRio()
  const pendientes = puntos.filter((punto) => !completos.has(punto.id))

  const puntosConError: string[] = []
  const resumenErrores: string[] = []
  let puntosProcesados = 0
  let filasInsertadas = 0
  let corteSinRed: { motivo: string } | undefined

  for (const punto of pendientes) {
    if (corteSinRed) {
      // La guarda de cupo ya cortó: no se gasta otra llamada; el punto queda
      // pendiente para la próxima corrida.
      puntosConError.push(punto.id)
      resumenErrores.push(`${punto.id}: ${corteSinRed.motivo}`)
      continue
    }

    const { seriesPorPunto, erroresPorPunto } = await obtenerSeries({
      puntos: [punto],
      periodoDesde,
      periodoHasta,
      apiKey,
      controladorCupoFactory: (peso) =>
        crearControladorCupo({ host: 'flood-api', peso, apiKeyPresente: Boolean(apiKey), db }),
    })
    const serie = seriesPorPunto[punto.id]
    const fallo = erroresPorPunto[punto.id]
    if (fallo || serie === undefined) {
      puntosConError.push(punto.id)
      resumenErrores.push(`${punto.id}: ${fallo?.motivo ?? 'sin_serie'}`)
      if (fallo && MOTIVOS_CUPO_SIN_RED.has(fallo.motivo)) corteSinRed = { motivo: fallo.motivo }
      continue
    }

    const filas = calcularPercentilesCaudal({
      geometryRef: punto.id,
      valoresDiarios: serie,
      periodoDesde,
      periodoHasta,
    })

    for (const fila of filas) {
      // Upsert único por fila: seguro de reintentar ante un bloqueo (job, no
      // request path). El id generado en cada intento puede variar, pero no
      // es la clave del conflicto (lo es geometryRef+variable+percentil+
      // muestra+periodo+version), así que no afecta el resultado del upsert.
      await conReintentoPorBloqueo(() =>
        db
          .insert(hazardClimatology)
          .values({
            id: randomUUID(),
            geometryRef: fila.geometryRef,
            variable: fila.variable,
            percentil: fila.percentil,
            muestra: fila.muestra,
            valor: fila.valor,
            unidad: fila.unidad,
            periodoDesde: fila.periodoDesde,
            periodoHasta: fila.periodoHasta,
            version,
            calculadoEn: ahoraIso,
          })
          .onConflictDoUpdate({
            target: [
              hazardClimatology.geometryRef,
              hazardClimatology.variable,
              hazardClimatology.percentil,
              hazardClimatology.muestra,
              hazardClimatology.periodoDesde,
              hazardClimatology.periodoHasta,
              hazardClimatology.version,
            ],
            set: {
              valor: sql`excluded.valor`,
              unidad: sql`excluded.unidad`,
              calculadoEn: sql`excluded.calculado_en`,
            },
          }),
      )
    }

    puntosProcesados += 1
    filasInsertadas += filas.length
  }

  const contadores = {
    puntos: puntosProcesados,
    filas: filasInsertadas,
    puntosConError: puntosConError.length,
    puntosYaCompletos: completos.size,
  }
  const errorSaneado =
    resumenErrores.length > 0 ? resumenErrores.join('; ').slice(0, LARGO_MAX_ERROR) : undefined

  // Mientras quede algún punto sin climatología la corrida queda 'fallido' A
  // PROPÓSITO: la misma clave sigue reintentable y la próxima corrida retoma
  // sólo los pendientes (ver runbook-scheduler.md, "cursor resumable"). Antes
  // una falla parcial quedaba 'completado' y bloqueaba esos puntos para siempre.
  await publicarResultado({
    jobRunId: lease.jobRunId,
    leaseOwner: lease.leaseOwner,
    estado: puntosConError.length > 0 ? 'fallido' : 'completado',
    contadores,
    errorSaneado,
    ahora,
  })

  return {
    ok: true,
    resultado: { puntosProcesados, filasInsertadas, puntosConError, puntosYaCompletos: completos.size },
  }
}

/** Ids de punto con p90, p95 y p99 ya guardados para el período y la versión. */
async function puntosConClimatologiaCompleta(
  db: ReturnType<typeof getDb>,
  clave: { periodoDesde: string; periodoHasta: string; version: string },
): Promise<Set<string>> {
  const filas = await db
    .select({ geometryRef: hazardClimatology.geometryRef, percentil: hazardClimatology.percentil })
    .from(hazardClimatology)
    .where(
      and(
        eq(hazardClimatology.variable, VARIABLE_CAUDAL),
        eq(hazardClimatology.muestra, MUESTRA_CAUDAL),
        eq(hazardClimatology.periodoDesde, clave.periodoDesde),
        eq(hazardClimatology.periodoHasta, clave.periodoHasta),
        eq(hazardClimatology.version, clave.version),
      ),
    )
  const percentilesPorPunto = new Map<string, Set<string>>()
  for (const fila of filas) {
    const percentiles = percentilesPorPunto.get(fila.geometryRef) ?? new Set<string>()
    percentiles.add(fila.percentil)
    percentilesPorPunto.set(fila.geometryRef, percentiles)
  }
  const completos = new Set<string>()
  for (const [puntoId, percentiles] of percentilesPorPunto) {
    if (PERCENTILES_CAUDAL.every((percentil) => percentiles.has(percentil))) completos.add(puntoId)
  }
  return completos
}
