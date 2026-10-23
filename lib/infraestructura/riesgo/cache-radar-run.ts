import { createHash, randomUUID } from 'node:crypto'
import { and, asc, count, desc, eq, gt, inArray, isNotNull, like, lte, max, notLike, or, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import {
  hazardClimatology,
  hazardEnsembleProb,
  hazardForecast,
  infraGeoProfile,
  infraRadarRunCache,
} from '@/lib/db/schema'
import { VERSION_REGLA_PELIGRO } from './peligro/nivel'

const VERSION_CACHE = 'radar-danger-v1'
const ESPERA_MAXIMA_MS = 2_000
const ESPERA_ENTRE_INTENTOS_MS = 100
const LEASE_MS = 90_000
const HEARTBEAT_MS = 20_000

export interface IdentidadRadarRun {
  runId: string
  modeloVersion: string
  publicadoEn: string
  referenciasFingerprint: string
  environment?: string
}

export interface ResultadoCacheRadar<T extends Record<string, unknown>> {
  value: T
  cacheHit: boolean
}

export class EsperaCacheRadarAgotada extends Error {
  constructor() {
    super('El cálculo de Radar sigue en curso; vuelva a intentar.')
    this.name = 'EsperaCacheRadarAgotada'
  }
}

export class LeaseCacheRadarPerdido extends Error {
  constructor() {
    super('Se perdió el lease del cálculo de Radar antes de publicarlo.')
    this.name = 'LeaseCacheRadarPerdido'
  }
}

function entornoCache(): string {
  if (process.env.RADAR_CACHE_ENVIRONMENT) return process.env.RADAR_CACHE_ENVIRONMENT
  if (process.env.DATABASE_URL) {
    return `database:${createHash('sha256').update(process.env.DATABASE_URL).digest('hex')}`
  }
  return process.env.NODE_ENV ?? 'development'
}

export function fingerprintIdentidadRadar(identity: IdentidadRadarRun): string {
  const canonical = JSON.stringify({
    environment: identity.environment ?? entornoCache(),
    runId: identity.runId,
    modeloVersion: identity.modeloVersion,
    publicadoEn: identity.publicadoEn,
    reglasVersion: `${VERSION_REGLA_PELIGRO}:default`,
    referenciasFingerprint: identity.referenciasFingerprint,
    versionCache: VERSION_CACHE,
  })
  return createHash('sha256').update(canonical).digest('hex')
}

/**
 * Compact, per-reference input identity. The queries group source rows in
 * PostgreSQL; raw forecast history is never transferred to the application.
 * This route currently calls obtenerNivelesPeligro with its default rules, so
 * latest eligible run per geometryRef is the matching source identity.
 */
export async function fingerprintReferenciasRadar(cutoff: string): Promise<string> {
  const db = getDb()
  const perfiles = await db
    .select({
      geometryRef: infraGeoProfile.geometryRef,
      departamento: infraGeoProfile.departamento,
      perfilVersion: infraGeoProfile.perfilVersion,
      cantidadPerfiles: count(),
      calculadoEn: max(infraGeoProfile.calculadoEn),
    })
    .from(infraGeoProfile)
    .where(isNotNull(infraGeoProfile.geometryRef))
    .groupBy(infraGeoProfile.geometryRef, infraGeoProfile.departamento, infraGeoProfile.perfilVersion)
    .orderBy(infraGeoProfile.geometryRef, infraGeoProfile.departamento, infraGeoProfile.perfilVersion)

  const geometryRefs = [...new Set(perfiles.map((fila) => fila.geometryRef).filter((ref): ref is string => ref !== null))]
  if (geometryRefs.length === 0) {
    return createHash('sha256').update(JSON.stringify({ perfiles })).digest('hex')
  }

  const references = sql`unnest(ARRAY[${sql.join(geometryRefs.map(ref => sql`${ref}`), sql`, `)}]::text[])
    AS radar_references(geometry_ref)`
  const geometryRef = sql<string>`radar_references.geometry_ref`
  // LIMIT uses the per-cell run index instead of sorting the forecast history.
  const latestForecast = db
    .select({ corridaEn: hazardForecast.corridaEn })
    .from(hazardForecast)
    .where(and(
      eq(hazardForecast.geometryRef, geometryRef),
      eq(hazardForecast.variable, 'precipitacion'),
      lte(hazardForecast.corridaEn, cutoff),
    ))
    .orderBy(desc(hazardForecast.corridaEn))
    .limit(1)
    .as('latest_forecast')
  const forecastRuns = await db
    .select({ geometryRef, corridaEn: latestForecast.corridaEn })
    .from(references)
    .innerJoinLateral(latestForecast, sql`true`)
    .orderBy(geometryRef)
  const forecastIdentity = forecastRuns.length === 0 ? [] : (await Promise.all(
    [24, 72, 240].map((horizonte) => db
      .selectDistinctOn([hazardForecast.geometryRef], {
        id: hazardForecast.id,
        geometryRef: hazardForecast.geometryRef,
        corridaEn: hazardForecast.corridaEn,
        validoEn: hazardForecast.validoEn,
        horizonteHoras: hazardForecast.horizonteHoras,
        valor: hazardForecast.valor,
        pasoHoras: hazardForecast.pasoHoras,
        provider: hazardForecast.provider,
        ingeridoEn: hazardForecast.ingeridoEn,
      })
      .from(hazardForecast)
      .where(and(
        eq(hazardForecast.variable, 'precipitacion'),
        or(...forecastRuns.map((run) => and(
          eq(hazardForecast.geometryRef, run.geometryRef),
          eq(hazardForecast.corridaEn, run.corridaEn),
        ))),
      ))
      .orderBy(
        hazardForecast.geometryRef,
        sql`abs(${hazardForecast.horizonteHoras} - ${horizonte})`,
        asc(hazardForecast.horizonteHoras),
        // Matches nivel.ts: lexical provider order is deterministic, not a
        // scientific ranking; the remaining unique key resolves exact ties.
        asc(hazardForecast.provider),
        asc(hazardForecast.validoEn),
        asc(hazardForecast.id),
      )),
  )).flat()

  const ensembleRuns = await db
    .selectDistinctOn([hazardEnsembleProb.geometryRef], {
      geometryRef: hazardEnsembleProb.geometryRef,
      corridaEn: hazardEnsembleProb.corridaEn,
    })
    .from(hazardEnsembleProb)
    .where(and(
      inArray(hazardEnsembleProb.geometryRef, geometryRefs),
      eq(hazardEnsembleProb.variable, 'precipitacion_24h'),
      lte(hazardEnsembleProb.corridaEn, cutoff),
    ))
    .orderBy(hazardEnsembleProb.geometryRef, desc(hazardEnsembleProb.corridaEn))
  const ensembleIdentity = ensembleRuns.length === 0 ? [] : (await Promise.all(
    [24, 72].map((horizonte) => db
      .selectDistinctOn([hazardEnsembleProb.geometryRef], {
        id: hazardEnsembleProb.id,
        geometryRef: hazardEnsembleProb.geometryRef,
        corridaEn: hazardEnsembleProb.corridaEn,
        validoEn: hazardEnsembleProb.validoEn,
        horizonteHoras: hazardEnsembleProb.horizonteHoras,
        version: hazardEnsembleProb.version,
        probabilidadP95: hazardEnsembleProb.probabilidadP95,
        probabilidadP99: hazardEnsembleProb.probabilidadP99,
        miembrosValidos: hazardEnsembleProb.miembrosValidos,
        ingeridoEn: hazardEnsembleProb.ingeridoEn,
      })
      .from(hazardEnsembleProb)
      .where(and(
        eq(hazardEnsembleProb.variable, 'precipitacion_24h'),
        or(...ensembleRuns.map((run) => and(
          eq(hazardEnsembleProb.geometryRef, run.geometryRef),
          eq(hazardEnsembleProb.corridaEn, run.corridaEn),
        ))),
      ))
      .orderBy(
        hazardEnsembleProb.geometryRef,
        sql`abs(${hazardEnsembleProb.horizonteHoras} - ${horizonte})`,
        asc(hazardEnsembleProb.horizonteHoras),
        asc(hazardEnsembleProb.validoEn),
        asc(hazardEnsembleProb.id),
      )),
  )).flat()

  const climatologyIdentity = (await Promise.all([
    like(hazardClimatology.version, 'climatologia-imerg%'),
    notLike(hazardClimatology.version, 'climatologia-imerg%'),
  ].map((fuente) => db
    .selectDistinctOn([hazardClimatology.geometryRef, hazardClimatology.percentil], {
      id: hazardClimatology.id,
      geometryRef: hazardClimatology.geometryRef,
      percentil: hazardClimatology.percentil,
      valor: hazardClimatology.valor,
      calculadoEn: hazardClimatology.calculadoEn,
      version: hazardClimatology.version,
      periodoDesde: hazardClimatology.periodoDesde,
      periodoHasta: hazardClimatology.periodoHasta,
    })
    .from(hazardClimatology)
    .where(and(
      inArray(hazardClimatology.geometryRef, geometryRefs),
      eq(hazardClimatology.variable, 'precipitacion_diaria'),
      eq(hazardClimatology.muestra, 'todos_los_dias'),
      inArray(hazardClimatology.percentil, ['p90', 'p95', 'p99']),
      lte(hazardClimatology.calculadoEn, cutoff),
      fuente,
    ))
    .orderBy(
      hazardClimatology.geometryRef,
      hazardClimatology.percentil,
      desc(hazardClimatology.periodoHasta),
      desc(hazardClimatology.version),
      desc(hazardClimatology.calculadoEn),
      desc(hazardClimatology.periodoDesde),
      asc(hazardClimatology.id),
    )))).flat()

  const sourceIdentity = JSON.stringify({ perfiles, forecastIdentity, ensembleIdentity, climatologyIdentity })
  return createHash('sha256').update(sourceIdentity).digest('hex')
}

type CacheOptions = { leaseMs?: number; heartbeatMs?: number; waitMs?: number; pollMs?: number }

export async function obtenerOCrearCacheRadar<T extends Record<string, unknown>>(
  identity: IdentidadRadarRun,
  build: () => Promise<T>,
  options: CacheOptions = {},
): Promise<ResultadoCacheRadar<T>> {
  const db = getDb()
  const cacheKey = fingerprintIdentidadRadar(identity)
  const environment = identity.environment ?? entornoCache()
  const leaseMs = options.leaseMs ?? LEASE_MS
  const heartbeatMs = options.heartbeatMs ?? HEARTBEAT_MS
  const waitMs = options.waitMs ?? ESPERA_MAXIMA_MS
  const pollMs = options.pollMs ?? ESPERA_ENTRE_INTENTOS_MS
  const deadline = Date.now() + waitMs

  while (true) {
    const ahora = new Date().toISOString()
    const [claim] = await db
      .insert(infraRadarRunCache)
      .values({
        cacheKey,
        environment,
        riskRunId: identity.runId,
        modeloVersion: identity.modeloVersion,
        publicadoEn: identity.publicadoEn,
        reglasVersion: `${VERSION_REGLA_PELIGRO}:default`,
        referenciasFingerprint: identity.referenciasFingerprint,
        estado: 'building',
        leaseOwner: randomUUID(),
        leaseExpiraEn: new Date(Date.now() + leaseMs).toISOString(),
        payload: null,
        creadaEn: ahora,
        actualizadaEn: ahora,
      })
      .onConflictDoUpdate({
        target: infraRadarRunCache.cacheKey,
        set: {
          estado: 'building',
          leaseOwner: randomUUID(),
          leaseExpiraEn: new Date(Date.now() + leaseMs).toISOString(),
          payload: null,
          actualizadaEn: ahora,
        },
        setWhere: or(
          eq(infraRadarRunCache.estado, 'failed'),
          and(eq(infraRadarRunCache.estado, 'building'), lte(infraRadarRunCache.leaseExpiraEn, ahora)),
        ),
      })
      .returning({ leaseOwner: infraRadarRunCache.leaseOwner })

    if (claim?.leaseOwner) {
      const owner = claim.leaseOwner
      let lostLease = false
      let heartbeatBusy = false
      const heartbeat = setInterval(async () => {
        if (heartbeatBusy) return
        heartbeatBusy = true
        try {
          const [renewed] = await db
            .update(infraRadarRunCache)
            .set({
              leaseExpiraEn: new Date(Date.now() + leaseMs).toISOString(),
              actualizadaEn: new Date().toISOString(),
            })
            .where(and(
              eq(infraRadarRunCache.cacheKey, cacheKey),
              eq(infraRadarRunCache.estado, 'building'),
              eq(infraRadarRunCache.leaseOwner, owner),
              gt(infraRadarRunCache.leaseExpiraEn, new Date().toISOString()),
            ))
            .returning({ cacheKey: infraRadarRunCache.cacheKey })
          if (!renewed) lostLease = true
        } catch {
          lostLease = true
        } finally {
          heartbeatBusy = false
        }
      }, heartbeatMs)

      try {
        const value = await build()
        if (lostLease) throw new LeaseCacheRadarPerdido()
        const [published] = await db
          .update(infraRadarRunCache)
          .set({
            estado: 'ready',
            payload: value,
            leaseOwner: null,
            leaseExpiraEn: null,
            actualizadaEn: new Date().toISOString(),
          })
          .where(and(
            eq(infraRadarRunCache.cacheKey, cacheKey),
            eq(infraRadarRunCache.estado, 'building'),
            eq(infraRadarRunCache.leaseOwner, owner),
            gt(infraRadarRunCache.leaseExpiraEn, new Date().toISOString()),
          ))
          .returning({ cacheKey: infraRadarRunCache.cacheKey })
        if (!published) throw new LeaseCacheRadarPerdido()
        return { value, cacheHit: false }
      } catch (error) {
        await db
          .update(infraRadarRunCache)
          .set({ estado: 'failed', leaseOwner: null, leaseExpiraEn: null, payload: null, actualizadaEn: new Date().toISOString() })
          .where(and(
            eq(infraRadarRunCache.cacheKey, cacheKey),
            eq(infraRadarRunCache.estado, 'building'),
            eq(infraRadarRunCache.leaseOwner, owner),
          ))
          .catch(() => undefined)
        throw error
      } finally {
        clearInterval(heartbeat)
      }
    }

    const [row] = await db
      .select({ estado: infraRadarRunCache.estado, leaseExpiraEn: infraRadarRunCache.leaseExpiraEn, payload: infraRadarRunCache.payload })
      .from(infraRadarRunCache)
      .where(eq(infraRadarRunCache.cacheKey, cacheKey))
      .limit(1)
    if (row?.estado === 'ready' && row.payload) {
      return { value: row.payload as T, cacheHit: true }
    }
    if (Date.now() >= deadline) throw new EsperaCacheRadarAgotada()
    if (row?.estado === 'building' && row.leaseExpiraEn && row.leaseExpiraEn > new Date().toISOString()) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(pollMs, deadline - Date.now())))
    }
  }
}
