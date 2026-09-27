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
// `puntosConError` y se sigue con el próximo; el estado general queda
// completado.
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

  // Una sola pasada de red para los 8 puntos fijos; los que fallen quedan en
  // `erroresPorPunto` sin bloquear a los demás.
  const { seriesPorPunto, erroresPorPunto } = await obtenerSeries({
    puntos: PUNTOS_RIO,
    periodoDesde,
    periodoHasta,
  })

  const puntosConError: string[] = []
  let puntosProcesados = 0
  let filasInsertadas = 0

  for (const punto of PUNTOS_RIO) {
    const serie = seriesPorPunto[punto.id]
    if (erroresPorPunto[punto.id] || serie === undefined) {
      puntosConError.push(punto.id)
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

  await publicarResultado({
    jobRunId: lease.jobRunId,
    leaseOwner: lease.leaseOwner,
    estado: 'completado',
    contadores: { puntos: puntosProcesados, filas: filasInsertadas },
    ahora,
  })

  return {
    ok: true,
    resultado: { puntosProcesados, filasInsertadas, puntosConError },
  }
}
