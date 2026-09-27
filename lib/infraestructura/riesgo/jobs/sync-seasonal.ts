// Job de sync de la tendencia ENOS a 30-90 días (Open-Meteo Seasonal,
// SEASONAL): consulta el centroide de cada uno de los 25 departamentos de
// Corrientes (NUNCA una escuela — ver providers/seasonal.ts) y persiste las
// estadísticas de miembros en `hazard_seasonal_trend`, actualizando además la
// salud del proveedor en `hazard_source_health`. Capa opcional detrás del
// flag SEASONAL_ENABLED (sólo UI; el job corre siempre que ENOS_JOBS_ENABLED
// lo permita, igual criterio que el resto de los jobs OPS1).
//
// Idempotencia en dos capas (mismo patrón que sync-ensemble.ts):
// 1. `infra_job_run`: la claveIdempotente es el día UTC (una corrida diaria),
//    así que dos invocaciones el mismo día compiten por el MISMO job run.
// 2. `hazard_seasonal_trend_uidx`
//    (departamento+variable+emisionEn+horizonteDesdeDias+horizonteHastaDias):
//    si se reintenta el mismo día, el upsert actualiza en vez de duplicar.
//
// Un departamento sin dato o un lote que falla NO tumba el job: queda en
// `erroresPorDepartamento` (el provider lo reporta) y el sync completa igual;
// el estado se refleja en `hazard_source_health` como `degradado`.
import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { hazardSeasonalTrend, hazardSourceHealth } from '@/lib/db/schema'
import { CENTROIDES_DEPARTAMENTOS_CORRIENTES } from '@/lib/mapas/departamento-centroides'
import { normalizarNombreDepartamento } from '@/lib/mapas/normalizar-departamento'
import {
  FORECAST_DAYS_SOLICITADOS,
  MODELO_SEASONAL,
  obtenerTendenciaEstacional as obtenerTendenciaEstacionalReal,
  TAMANO_LOTE_DEPARTAMENTOS_SEASONAL,
} from '../providers/seasonal'
import type { EstadisticaEstacionalDepartamento } from '../providers/seasonal'
import { adquirirLease, publicarResultado, renovarLease as renovarLeaseReal } from '../job-run'
import { apiKeyDesdeEntorno, asegurarPesoAlcanzable, pesoLlamada } from '../providers/cupo-om'

// Variables de `daily=` en la request Seasonal (ver providers/seasonal.ts,
// `VARIABLE_DIARIA_SEASONAL`): sólo `precipitation_sum`, los 51 miembros
// vienen como columnas del mismo payload, no cuentan como variables extra.
const VARIABLES_SEASONAL = 1

export type ResultadoSyncSeasonal = {
  departamentosConsultados: number
  filasInsertadas: number
  llamadasRealizadas: number
}

export type ResultadoEjecucionSyncSeasonal =
  | { ok: true; resultado: ResultadoSyncSeasonal }
  | { ok: false; motivo: 'lease_no_disponible' }
  | {
      ok: false
      motivo: 'lease_perdido_durante_ejecucion'
      resultado: ResultadoSyncSeasonal
    }

const TIPO_JOB = 'sync-hazard-seasonal'
const VERSION_JOB = 'v1'
const DURACION_LEASE_MS = 5 * 60 * 1000
// Cadencia diaria (ver cadencias.ts): TTL de frescura = 24h con margen (36h)
// para no marcar `degradado` por una corrida que llegó un poco tarde dentro
// del mismo día.
const TTL_MINUTOS = 60 * 36
const LICENCIA = 'CC-BY 4.0 no comercial — Open-Meteo + ECMWF, nivel gratuito'
const LARGO_MAX_ERROR = 300

// Mismo motivo que sync-ensemble.ts (TAMANO_CHUNK_INSERCION): nunca un solo
// `.values()` con todas las filas. Con 25 departamentos como mucho esto nunca
// se activa hoy, pero deja el job correcto si el alcance crece a una grilla
// regional más fina.
const TAMANO_CHUNK_INSERCION = 500

const PROVIDER = 'open-meteo-seasonal'
const VERSION_SEASONAL = 'seasonal-v0.1'

// Tamaño de tanda del job, alineado con el lote interno de centroides del
// provider: cada invocación corresponde a una request HTTP: entre tanda y
// tanda se renueva el lease (mismo concepto que sync-ensemble.ts).
const TAMANO_TANDA_DEPARTAMENTOS = TAMANO_LOTE_DEPARTAMENTOS_SEASONAL

type Db = ReturnType<typeof getDb>

/** Día UTC (YYYY-MM-DD): una corrida diaria comparte claveIdempotente y por lo tanto es la MISMA corrida. */
function claveIdempotenteDeDia(ahora: Date): string {
  return ahora.toISOString().slice(0, 10)
}

/** Ancla `emisionEn` al INICIO del día UTC, no al wall-clock. */
function inicioDeDiaUtc(ahora: Date): Date {
  return new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate(), 0, 0, 0, 0))
}

async function persistirEstadisticas(
  db: Db,
  estadisticas: EstadisticaEstacionalDepartamento[],
  ingeridoEn: string,
): Promise<number> {
  if (estadisticas.length === 0) return 0

  const filas = estadisticas.map((estadistica) => ({
    id: randomUUID(),
    departamento: normalizarNombreDepartamento(estadistica.departamento),
    provider: PROVIDER,
    model: MODELO_SEASONAL,
    variable: estadistica.variable,
    emisionEn: estadistica.emisionEn,
    validoDesde: estadistica.validoDesde,
    validoHasta: estadistica.validoHasta,
    horizonteDesdeDias: estadistica.horizonteDesdeDias,
    horizonteHastaDias: estadistica.horizonteHastaDias,
    miembrosTotal: estadistica.miembrosTotal,
    miembrosValidos: estadistica.miembrosValidos,
    mediaMm: estadistica.mediaMm,
    medianaMm: estadistica.medianaMm,
    dispersionMm: estadistica.dispersionMm,
    probabilidadSobreNormal: estadistica.probabilidadSobreNormal,
    version: VERSION_SEASONAL,
    ingeridoEn,
  }))

  await db.transaction(async (tx) => {
    for (let inicio = 0; inicio < filas.length; inicio += TAMANO_CHUNK_INSERCION) {
      const chunk = filas.slice(inicio, inicio + TAMANO_CHUNK_INSERCION)
      await tx
        .insert(hazardSeasonalTrend)
        .values(chunk)
        .onConflictDoUpdate({
          target: [
            hazardSeasonalTrend.departamento,
            hazardSeasonalTrend.variable,
            hazardSeasonalTrend.emisionEn,
            hazardSeasonalTrend.horizonteDesdeDias,
            hazardSeasonalTrend.horizonteHastaDias,
          ],
          set: {
            provider: sql`excluded.provider`,
            model: sql`excluded.model`,
            validoDesde: sql`excluded.valido_desde`,
            validoHasta: sql`excluded.valido_hasta`,
            miembrosTotal: sql`excluded.miembros_total`,
            miembrosValidos: sql`excluded.miembros_validos`,
            mediaMm: sql`excluded.media_mm`,
            medianaMm: sql`excluded.mediana_mm`,
            dispersionMm: sql`excluded.dispersion_mm`,
            probabilidadSobreNormal: sql`excluded.probabilidad_sobre_normal`,
            version: sql`excluded.version`,
            ingeridoEn: sql`excluded.ingerido_en`,
          },
        })
    }
  })

  return filas.length
}

async function actualizarSalud(
  db: Db,
  erroresPorDepartamento: Record<string, string>,
  ahoraIso: string,
): Promise<void> {
  const mensajes = Object.values(erroresPorDepartamento)
  const hayError = mensajes.length > 0
  const primerError = hayError ? mensajes[0].slice(0, LARGO_MAX_ERROR) : null

  await db
    .insert(hazardSourceHealth)
    .values({
      provider: PROVIDER,
      ultimoExitoEn: hayError ? null : ahoraIso,
      ultimoIntentoEn: ahoraIso,
      estado: hayError ? 'degradado' : 'ok',
      ultimoErrorSaneado: primerError,
      ttlMinutos: TTL_MINUTOS,
      licencia: LICENCIA,
      actualizadaEn: ahoraIso,
    })
    .onConflictDoUpdate({
      target: hazardSourceHealth.provider,
      set: {
        estado: hayError ? 'degradado' : 'ok',
        ultimoIntentoEn: ahoraIso,
        ultimoErrorSaneado: primerError,
        ttlMinutos: TTL_MINUTOS,
        licencia: LICENCIA,
        actualizadaEn: ahoraIso,
        ...(hayError ? {} : { ultimoExitoEn: ahoraIso }),
      },
    })
}

export async function ejecutarSyncSeasonal(params?: {
  ahora?: Date
  // Seam de test: permite inyectar el provider sin red.
  obtenerTendenciaEstacional?: typeof obtenerTendenciaEstacionalReal
  // Seam de test: permite inyectar un `renovarLease` fake.
  renovarLease?: typeof renovarLeaseReal
}): Promise<ResultadoEjecucionSyncSeasonal> {
  const db = getDb()
  const ahora = params?.ahora ?? new Date()
  const ahoraIso = ahora.toISOString()

  const claveIdempotente = claveIdempotenteDeDia(ahora)
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

  // Mismo motivo que sync-ensemble.ts: sin este try/catch, una excepción
  // posterior a adquirir el lease deja `infra_job_run` en 'en_progreso' hasta
  // que el lease venza solo.
  try {
    return await ejecutarCuerpoDelJobSeasonal({ db, ahora, ahoraIso, lease, params })
  } catch (error) {
    await publicarResultado({
      jobRunId: lease.jobRunId,
      leaseOwner: lease.leaseOwner,
      estado: 'fallido',
      errorSaneado: 'fallo al ejecutar sync-hazard-seasonal',
      ahora,
    })
    throw error
  }
}

async function ejecutarCuerpoDelJobSeasonal(ctx: {
  db: Db
  ahora: Date
  ahoraIso: string
  lease: { adquirido: true; jobRunId: string; leaseOwner: string }
  params?: {
    ahora?: Date
    obtenerTendenciaEstacional?: typeof obtenerTendenciaEstacionalReal
    renovarLease?: typeof renovarLeaseReal
  }
}): Promise<ResultadoEjecucionSyncSeasonal> {
  const { db, ahora, ahoraIso, lease, params } = ctx

  const obtener = params?.obtenerTendenciaEstacional ?? obtenerTendenciaEstacionalReal
  const renovar = params?.renovarLease ?? renovarLeaseReal

  const emisionEn = inicioDeDiaUtc(ahora)
  const centroides = CENTROIDES_DEPARTAMENTOS_CORRIENTES

  const erroresPorDepartamento: Record<string, string> = {}
  let departamentosConsultados = 0
  let filasInsertadas = 0
  let llamadasRealizadas = 0
  let leasePerdido = false

  const totalDepartamentos = centroides.length
  for (let indice = 0; indice < totalDepartamentos; indice += TAMANO_TANDA_DEPARTAMENTOS) {
    const tanda = centroides.slice(indice, indice + TAMANO_TANDA_DEPARTAMENTOS)

    let diagnostico: {
      estadisticas: EstadisticaEstacionalDepartamento[]
      erroresPorDepartamento: Record<string, string>
    }
    try {
      // Guard #3 del batch OM-cupo (requisito 4: "conectá el guard también en
      // el job, no sólo en el proveedor"): valida ACÁ, antes de llamar al
      // provider, que el peso de la tanda no supere el límite de minuto por sí
      // solo. Hoy (95 días, 5 departamentos por tanda) el peso es chico y esto
      // nunca dispara; si el horizonte o el tamaño de tanda crecen a futuro,
      // corta con un error explícito en vez de dejar que el provider entre en
      // un loop de `cupo_minuto_agotado` imposible de satisfacer.
      asegurarPesoAlcanzable({
        peso: pesoLlamada({ ubicaciones: tanda.length, variables: VARIABLES_SEASONAL, dias: FORECAST_DAYS_SOLICITADOS }),
        apiKeyPresente: Boolean(apiKeyDesdeEntorno()),
      })
      diagnostico = await obtener({ centroides: tanda, emisionEn })
    } catch (error) {
      // Un provider que lanza (o el guard de arriba) no debe tumbar el job:
      // se traduce a error en todos sus departamentos y se sigue (mismo
      // criterio que sync-ensemble.ts).
      const mensaje = error instanceof Error ? error.message : String(error)
      const errores: Record<string, string> = {}
      for (const centroide of tanda) {
        errores[centroide.departamento] = `proveedor_throw: ${mensaje}`
      }
      diagnostico = { estadisticas: [], erroresPorDepartamento: errores }
    }

    Object.assign(erroresPorDepartamento, diagnostico.erroresPorDepartamento)
    filasInsertadas += await persistirEstadisticas(db, diagnostico.estadisticas, ahoraIso)
    departamentosConsultados += tanda.length
    llamadasRealizadas += 1

    if (indice + TAMANO_TANDA_DEPARTAMENTOS >= totalDepartamentos) continue

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

  const resultado: ResultadoSyncSeasonal = {
    departamentosConsultados,
    filasInsertadas,
    llamadasRealizadas,
  }

  if (leasePerdido) {
    return { ok: false, motivo: 'lease_perdido_durante_ejecucion', resultado }
  }

  await actualizarSalud(db, erroresPorDepartamento, ahoraIso)

  await publicarResultado({
    jobRunId: lease.jobRunId,
    leaseOwner: lease.leaseOwner,
    estado: 'completado',
    contadores: { llamadas: resultado.llamadasRealizadas, filas: filasInsertadas },
    ahora,
  })

  return { ok: true, resultado }
}
