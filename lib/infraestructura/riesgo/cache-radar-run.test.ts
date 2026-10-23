import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import {
  hazardClimatology,
  hazardEnsembleProb,
  hazardForecast,
  infraGeoProfile,
  infraRadarRunCache,
  infraRiskRun,
} from '@/lib/db/schema'
import { PERIODO_ENOS_2026_2027_ID } from '@/lib/db/seed'
import {
  EsperaCacheRadarAgotada,
  LeaseCacheRadarPerdido,
  obtenerOCrearCacheRadar,
  fingerprintReferenciasRadar,
  type IdentidadRadarRun,
} from './cache-radar-run'

usarDbTemporal('radar-run-cache-', { seed: false })

const CORTE = '2026-10-23T00:00:00.000Z'
const valor = (revision: string) => ({ revision })
let secuenciaRun = 0

async function nuevoRun(id = `cache-run-${++secuenciaRun}`) {
  await getDb().insert(infraRiskRun).values({
    id,
    periodoId: PERIODO_ENOS_2026_2027_ID,
    modeloVersion: 'motor-v0.4',
    iniciadoEn: CORTE,
    publicadoEn: CORTE,
    estado: 'completado',
    cobertura: { procesadas: 1 },
    creadaEn: CORTE,
    modo: 'operativo',
    metadatos: null,
  })
  return id
}

function identidad(runId = 'cache-run-1', referenciasFingerprint = 'inputs-1'): IdentidadRadarRun {
  return { runId, modeloVersion: 'motor-v0.4', publicadoEn: CORTE, referenciasFingerprint, environment: 'test' }
}

beforeAll(async () => {
  await (await import('@/lib/db/seed')).ensureSeeded()
})

beforeEach(async () => {
  await getDb().delete(hazardEnsembleProb)
  await getDb().delete(hazardForecast)
  await getDb().delete(hazardClimatology)
  await getDb().delete(infraGeoProfile)
  await getDb().delete(infraRadarRunCache)
  await getDb().delete(infraRiskRun)
  await nuevoRun('cache-run-1')
})

describe('cache compartida por corrida de Radar', () => {
  it('reutiliza el resultado warm y recalcula al cambiar de run o de referencias', async () => {
    let llamadas = 0
    const build = async () => valor(String(++llamadas))

    expect(await obtenerOCrearCacheRadar(identidad(), build)).toMatchObject({ value: valor('1'), cacheHit: false })
    expect(await obtenerOCrearCacheRadar(identidad(), build)).toMatchObject({ value: valor('1'), cacheHit: true })

    await nuevoRun('cache-run-2')
    expect(await obtenerOCrearCacheRadar(identidad('cache-run-2'), build)).toMatchObject({ value: valor('2'), cacheHit: false })
    expect(await obtenerOCrearCacheRadar(identidad('cache-run-1', 'inputs-2'), build)).toMatchObject({ value: valor('3'), cacheHit: false })
  })

  it('permite un único builder ante reclamos simultáneos', async () => {
    let llamadas = 0
    let liberar!: () => void
    const barrera = new Promise<void>((resolve) => { liberar = resolve })
    const build = async () => {
      llamadas += 1
      await barrera
      return valor('single')
    }

    const primero = obtenerOCrearCacheRadar(identidad(), build, { waitMs: 1_000, pollMs: 5 })
    await new Promise((resolve) => setTimeout(resolve, 10))
    const segundo = obtenerOCrearCacheRadar(identidad(), build, { waitMs: 1_000, pollMs: 5 })
    await new Promise((resolve) => setTimeout(resolve, 10))
    liberar()

    const resultados = await Promise.all([primero, segundo])
    expect(llamadas).toBe(1)
    expect(resultados.map((r) => r.value)).toEqual([valor('single'), valor('single')])
    expect(resultados.map((r) => r.cacheHit).sort()).toEqual([false, true])
  })

  it('libera una construcción fallida y permite reintentar sin cachear el error', async () => {
    await expect(obtenerOCrearCacheRadar(identidad(), async () => { throw new Error('failure') }))
      .rejects.toThrow('failure')
    const [fallida] = await getDb().select().from(infraRadarRunCache)
    expect(fallida.estado).toBe('failed')
    expect(fallida.payload).toBeNull()

    await expect(obtenerOCrearCacheRadar(identidad(), async () => valor('recovered')))
      .resolves.toMatchObject({ value: valor('recovered'), cacheHit: false })
  })

  it('fingerprinta corridas elegibles por celda y excluye forecast posterior al cutoff', async () => {
    const db = getDb()
    await db.insert(infraGeoProfile).values({
      cueAnexo: 'cache-geo-1',
      lat: -27,
      lon: -58,
      geoCalidad: 'alta',
      departamento: 'ALFA',
      geometryRef: 'cache-cell-1',
      motivoExclusion: null,
      perfilVersion: 'profile-v1',
      calculadoEn: '2026-10-20T00:00:00.000Z',
    })
    const base = {
      provider: 'open-meteo',
      variable: 'precipitacion',
      geometryRef: 'cache-cell-1',
      validoEn: '2026-10-23T12:00:00.000Z',
      horizonteHoras: 12,
      valor: 8,
      unidad: 'mm',
      pasoHoras: 1,
      rawRef: null,
      ingeridoEn: '2026-10-22T00:00:00.000Z',
    }
    await db.insert(hazardForecast).values({
      ...base,
      id: 'cache-forecast-before',
      corridaEn: '2026-10-22T00:00:00.000Z',
    })
    const initial = await fingerprintReferenciasRadar(CORTE)
    await db.insert(hazardForecast).values({
      ...base,
      id: 'cache-forecast-future',
      corridaEn: '2026-10-24T00:00:00.000Z',
      validoEn: '2026-10-24T12:00:00.000Z',
    })
    expect(await fingerprintReferenciasRadar(CORTE)).toBe(initial)

    await db.insert(hazardForecast).values({
      ...base,
      id: 'cache-forecast-new-eligible',
      corridaEn: '2026-10-22T18:00:00.000Z',
      validoEn: '2026-10-23T06:00:00.000Z',
      ingeridoEn: '2026-10-22T18:10:00.000Z',
    })
    expect(await fingerprintReferenciasRadar(CORTE)).not.toBe(initial)
  })

  it('mantiene el mismo proveedor elegido por nivel y fingerprint ante orden de inserción invertido', async () => {
    const db = getDb()
    const geometryRef = 'cache-provider-tie'
    await db.insert(infraGeoProfile).values({
      cueAnexo: 'cache-provider-tie',
      lat: -27,
      lon: -58,
      geoCalidad: 'alta',
      departamento: 'ALFA',
      geometryRef,
      motivoExclusion: null,
      perfilVersion: 'profile-v1',
      calculadoEn: '2026-10-20T00:00:00.000Z',
    })
    const fila = (provider: string, valorPronosticado: number) => ({
      id: `tie-${provider}`,
      provider,
      variable: 'precipitacion',
      geometryRef,
      corridaEn: '2026-10-22T00:00:00.000Z',
      validoEn: '2026-10-23T00:00:00.000Z',
      horizonteHoras: 24,
      valor: valorPronosticado,
      unidad: 'mm',
      pasoHoras: 1,
      rawRef: null,
      ingeridoEn: '2026-10-22T00:00:00.000Z',
    })
    const alpha = fila('alpha-provider', 4)
    const zeta = fila('zeta-provider', 40)
    const { obtenerNivelesPeligro } = await import('./peligro/nivel')

    await db.insert(hazardForecast).values([zeta, alpha])
    const fingerprintReverse = await fingerprintReferenciasRadar(CORTE)
    const resultReverse = await obtenerNivelesPeligro({ geometryRefs: [geometryRef], ahora: new Date(CORTE) })

    await db.delete(hazardForecast)
    await db.insert(hazardForecast).values([alpha, zeta])
    const fingerprintForward = await fingerprintReferenciasRadar(CORTE)
    const resultForward = await obtenerNivelesPeligro({ geometryRefs: [geometryRef], ahora: new Date(CORTE) })

    expect(fingerprintForward).toBe(fingerprintReverse)
    expect(resultForward).toEqual(resultReverse)
    expect(resultForward.find((row) => row.horizonteHoras === 24)?.precipitacionMm).toBe(4)

    await db.update(hazardForecast).set({ valor: 5 }).where(eq(hazardForecast.id, alpha.id))
    expect(await fingerprintReferenciasRadar(CORTE)).not.toBe(fingerprintForward)
    expect((await obtenerNivelesPeligro({ geometryRefs: [geometryRef], ahora: new Date(CORTE) }))
      .find((row) => row.horizonteHoras === 24)?.precipitacionMm).toBe(5)
  })

  it('no deja publicar al dueño cuyo lease venció y fue reclamado por otro', async () => {
    let terminarPrimero!: () => void
    const primeraConstruccion = new Promise<void>((resolve) => { terminarPrimero = resolve })
    const primero = obtenerOCrearCacheRadar(identidad(), async () => {
      await primeraConstruccion
      return valor('stale')
    }, { leaseMs: 30, heartbeatMs: 5_000, waitMs: 500, pollMs: 5 })

    await new Promise((resolve) => setTimeout(resolve, 40))
    const segundo = await obtenerOCrearCacheRadar(identidad(), async () => valor('current'), {
      leaseMs: 500,
      heartbeatMs: 5_000,
      waitMs: 200,
      pollMs: 5,
    })
    terminarPrimero()

    await expect(primero).rejects.toBeInstanceOf(LeaseCacheRadarPerdido)
    expect(segundo).toMatchObject({ value: valor('current'), cacheHit: false })
    const [fila] = await getDb().select().from(infraRadarRunCache)
    expect(fila.estado).toBe('ready')
    expect(fila.payload).toEqual(valor('current'))
  })

  it('falla con espera acotada si otra instancia conserva el lease', async () => {
    let liberar!: () => void
    const bloqueada = new Promise<void>((resolve) => { liberar = resolve })
    const primero = obtenerOCrearCacheRadar(identidad(), async () => {
      await bloqueada
      return valor('late')
    }, { leaseMs: 1_000, heartbeatMs: 5_000 })
    await new Promise((resolve) => setTimeout(resolve, 10))

    await expect(obtenerOCrearCacheRadar(identidad(), async () => valor('duplicate'), {
      waitMs: 20,
      pollMs: 5,
    })).rejects.toBeInstanceOf(EsperaCacheRadarAgotada)
    liberar()
    await primero
  })
})
