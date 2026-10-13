// Job de cálculo de climatología de caudal (E3a): recorre los puntos fijos de
// río (`PUNTOS_RIO`), pide a Open-Meteo Flood API (GloFAS) la serie histórica
// diaria de cada uno y persiste los percentiles p90/p95/p99 calculados en
// `hazard_climatology`. No es un sync periódico: es un cálculo offline y bajo
// demanda sobre una ventana histórica fija.
//
// Es la contraparte de caudal de `calcular-climatologia.ts` (precipitación),
// deliberadamente en un archivo separado: distinta variable, distinto endpoint
// y distinta fuente de puntos (ids de `PUNTOS_RIO`, no celdas de
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
// No se renueva el lease: son sólo 8 puntos y una única pasada de red, muy por
// debajo de la duración del lease. Un punto caído NO tumba el job: se agrega a
// `puntosConError` y se sigue con el próximo.
//
// Estado final (P-1, evitar éxito sin datos):
// - Si ningún punto se procesa, `infra_job_run` queda 'fallido' con
//   `errorSaneado` = "<puntoId>: <motivo>" por cada punto. Al quedar 'fallido'
//   la misma clave es reintentable.
// - Si al menos un punto se procesa pero algunos fallan, queda 'completado' con
//   `contadores.puntosConError` (cantidad) y `errorSaneado` con el resumen por
//   punto (acotado a 500 caracteres).
import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { conReintentoPorBloqueo } from '@/lib/db/reintento'
import { hazardClimatology } from '@/lib/db/schema'
import { adquirirLease, publicarResultado } from '../job-run'
import { PUNTOS_RIO } from '../puntos-rio'
import {
  calcularPercentilesCaudal,
  obtenerSeriesHistoricasCaudal,
} from '../providers/climatologia-caudal'
import { apiKeyDesdeEntorno, crearControladorCupo } from '../providers/cupo-om'

export type ResultadoCalcularClimatologiaCaudal = {
  puntosProcesados: number
  filasInsertadas: number
  puntosConError: string[]
}

const TIPO_JOB = 'calcular-hazard-climatologia-caudal'
const DURACION_LEASE_MS = 10 * 60 * 1000
const PERIODO_DESDE_DEFAULT = '2015-01-01'
const PERIODO_HASTA_DEFAULT = '2024-12-31'
const VERSION_DEFAULT = 'caudal-climatologia-v0.1'
const LARGO_MAX_ERROR = 500

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

  // Una sola pasada de red para los 8 puntos fijos; los que fallen quedan en
  // `erroresPorPunto` sin bloquear a los demás.
  const apiKey = apiKeyDesdeEntorno()
  const { seriesPorPunto, erroresPorPunto } = await obtenerSeries({
    puntos: PUNTOS_RIO,
    periodoDesde,
    periodoHasta,
    apiKey,
    controladorCupoFactory: (peso) =>
      crearControladorCupo({ host: 'flood-api', peso, apiKeyPresente: Boolean(apiKey), db }),
  })

  const puntosConError: string[] = []
  const resumenErrores: string[] = []
  let puntosProcesados = 0
  let filasInsertadas = 0

  for (const punto of PUNTOS_RIO) {
    const serie = seriesPorPunto[punto.id]
    const fallo = erroresPorPunto[punto.id]
    if (fallo || serie === undefined) {
      puntosConError.push(punto.id)
      resumenErrores.push(`${punto.id}: ${fallo?.motivo ?? 'sin_serie'}`)
      continue
    }

    const filas = calcularPercentilesCaudal({
      geometryRef: punto.id,
      valoresDiarios: serie,
      periodoDesde,
      periodoHasta,
    })

    for (const fila of filas) {
      // Upsert único por fila: seguro de reintentar ante SQLITE_BUSY (job, no
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
  }
  const errorSaneado =
    resumenErrores.length > 0 ? resumenErrores.join('; ').slice(0, LARGO_MAX_ERROR) : undefined

  // Ningún punto procesado = la corrida no produjo nada: queda 'fallido' para
  // que la misma clave siga siendo reintentable. Con fallas parciales queda
  // 'completado' pero con `contadores.puntosConError` y `errorSaneado`.
  const sinPuntosProcesados = PUNTOS_RIO.length > 0 && puntosProcesados === 0
  await publicarResultado({
    jobRunId: lease.jobRunId,
    leaseOwner: lease.leaseOwner,
    estado: sinPuntosProcesados ? 'fallido' : 'completado',
    contadores,
    errorSaneado,
    ahora,
  })

  return {
    ok: true,
    resultado: { puntosProcesados, filasInsertadas, puntosConError },
  }
}
