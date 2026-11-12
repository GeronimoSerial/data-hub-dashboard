import { readFileSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb, migrarDb } from '@/lib/db'
import { hazardSourceHealth, hidroReferencia, infraJobRun } from '@/lib/db/schema'
import { obtenerEstacionesPrefectura } from './estaciones-prefectura'
import { parsearHistoricoPrefectura } from './historico-parser'
import { syncPrefecturaHistorico } from './sync-prefectura-historico'

// seed: false; migrations are applied explicitly in beforeAll.
usarDbTemporal('sync-prefectura-historico-', { seed: false })

const fixture = readFileSync(
  new URL('./__fixtures__/prefectura-historico-610.html', import.meta.url),
  'utf8',
)

const AHORA = new Date('2026-10-13T12:30:00.000Z')
const sinEsperar = async () => {}
const MIN_PRUEBA = 10

const estacionesCorrientes = obtenerEstacionesPrefectura().filter(
  (estacion) => estacion.rol === 'corrientes' && estacion.idHistorico != null,
)

function htmlOk(cuerpo: string): Response {
  return new Response(cuerpo, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}

function idSolicitado(url: string | URL | Request): number {
  const texto = url instanceof Request ? url.url : url.toString()
  return Number(new URL(texto).searchParams.get('id'))
}

describe('syncPrefecturaHistorico', () => {
  let db: ReturnType<typeof getDb>

  beforeAll(async () => {
    await migrarDb()
    db = getDb()
  })

  beforeEach(async () => {
    await db.delete(hidroReferencia)
    await db.delete(infraJobRun)
    await db.delete(hazardSourceHealth)
  })

  it('guarda estadísticas por estación del catálogo y publica completado', async () => {
    const fetchImpl = vi.fn(async () => htmlOk(fixture))

    const resultado = await syncPrefecturaHistorico({
      ahora: AHORA,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      esperar: sinEsperar,
      minLecturas: MIN_PRUEBA,
    })

    expect(resultado).toMatchObject({ ejecutado: true, estado: 'completo' })
    expect(fetchImpl).toHaveBeenCalledTimes(estacionesCorrientes.length)
    const filas = await db.select().from(hidroReferencia)
    expect(filas).toHaveLength(estacionesCorrientes.length)
    expect(filas.every((f) => f.ventanaDias === 365 && f.n === 40)).toBe(true)
    expect(filas.every((f) => f.p10M <= f.medianaM && f.medianaM <= f.p90M)).toBe(true)

    const [job] = await db.select().from(infraJobRun)
    expect(job).toMatchObject({
      tipo: 'sync-prefectura-historico',
      claveIdempotente: '2026-10-13',
      estado: 'completado',
    })
    expect(job?.contadores).toMatchObject({
      estaciones: estacionesCorrientes.length,
      estacionesConError: 0,
      estacionesInsuficientes: 0,
      guardadas: estacionesCorrientes.length,
    })
  })

  it('guarda min_m y max_m del histórico de 365 días por estación', async () => {
    const fetchImpl = vi.fn(async () => htmlOk(fixture))

    await syncPrefecturaHistorico({
      ahora: AHORA,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      esperar: sinEsperar,
      minLecturas: MIN_PRUEBA,
    })

    const valores = parsearHistoricoPrefectura(fixture).map((l) => l.lecturaM)
    const filas = await db.select().from(hidroReferencia)
    expect(filas).toHaveLength(estacionesCorrientes.length)
    for (const fila of filas) {
      expect(fila.minM).toBe(Math.min(...valores))
      expect(fila.maxM).toBe(Math.max(...valores))
      expect(fila.minM as number).toBeLessThanOrEqual(fila.p10M)
      expect(fila.maxM as number).toBeGreaterThanOrEqual(fila.p90M)
    }
  })

  it('una fila previa con min_m y max_m viejos se actualiza con el histórico nuevo', async () => {
    const estacionId = estacionesCorrientes[0]!.estacionId
    await db.insert(hidroReferencia).values({
      estacionId,
      ventanaDias: 365,
      n: 1,
      medianaM: 1,
      p10M: 0.5,
      p90M: 1.5,
      minM: 0,
      maxM: 1,
      desde: '2025-10-13T00:00:00.000Z',
      hasta: '2026-10-12T00:00:00.000Z',
      fuente: 'prefectura-historico',
      calculadoEn: '2026-10-01T00:00:00.000Z',
    })

    await syncPrefecturaHistorico({
      ahora: AHORA,
      fetchImpl: vi.fn(async () => htmlOk(fixture)) as unknown as typeof fetch,
      esperar: sinEsperar,
      minLecturas: MIN_PRUEBA,
    })

    const valores = parsearHistoricoPrefectura(fixture).map((l) => l.lecturaM)
    const [fila] = await db.select().from(hidroReferencia).where(eq(hidroReferencia.estacionId, estacionId))
    expect(fila).toMatchObject({ minM: Math.min(...valores), maxM: Math.max(...valores) })
  })

  it('con menos lecturas que el mínimo no guarda nada y conserva la fila previa', async () => {
    const previa = {
      estacionId: estacionesCorrientes[0]!.estacionId,
      ventanaDias: 365,
      n: 1,
      medianaM: 1,
      p10M: 0.5,
      p90M: 1.5,
      desde: '2025-10-13T00:00:00.000Z',
      hasta: '2026-10-12T00:00:00.000Z',
      fuente: 'prefectura-historico',
      calculadoEn: '2026-10-01T00:00:00.000Z',
    }
    await db.insert(hidroReferencia).values(previa)
    const fetchImpl = vi.fn(async () => htmlOk(fixture))

    const resultado = await syncPrefecturaHistorico({
      ahora: AHORA,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      esperar: sinEsperar,
    })

    expect(resultado).toMatchObject({ ejecutado: true, estado: 'completo' })
    const filas = await db.select().from(hidroReferencia)
    // minM/maxM son columnas nuevas (migración 0056): la fila previa no los tiene, quedan NULL.
    expect(filas).toEqual([{ ...previa, minM: null, maxM: null }])
    const [job] = await db.select().from(infraJobRun)
    expect(job?.contadores).toMatchObject({
      estacionesInsuficientes: estacionesCorrientes.length,
      guardadas: 0,
      estacionesConError: 0,
    })
  })

  it('una estación con HTTP 500 se cuenta como error sin detener el lote', async () => {
    const idFallido = estacionesCorrientes[0]!.idHistorico
    const fetchImpl = vi.fn(async (url: string | URL | Request) =>
      idSolicitado(url) === idFallido
        ? new Response('error', { status: 500 })
        : htmlOk(fixture),
    )

    const resultado = await syncPrefecturaHistorico({
      ahora: AHORA,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      esperar: sinEsperar,
      minLecturas: MIN_PRUEBA,
    })

    expect(resultado).toMatchObject({ ejecutado: true, estado: 'completo' })
    expect(resultado).toMatchObject({
      contadores: {
        estacionesConError: 1,
        guardadas: estacionesCorrientes.length - 1,
      },
    })
    const filas = await db.select().from(hidroReferencia)
    expect(filas.some((f) => f.estacionId === estacionesCorrientes[0]!.estacionId)).toBe(false)
  })

  it('si todas las estaciones fallan publica fallido', async () => {
    const fetchImpl = vi.fn(async () => new Response('error', { status: 500 }))

    const resultado = await syncPrefecturaHistorico({
      ahora: AHORA,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      esperar: sinEsperar,
      minLecturas: MIN_PRUEBA,
    })

    expect(resultado).toMatchObject({ ejecutado: false, estado: 'fallido' })
    const [job] = await db.select().from(infraJobRun)
    expect(job).toMatchObject({ estado: 'fallido' })
    expect(await db.select().from(hidroReferencia)).toHaveLength(0)
  })

  it('con el lease del día ya completado devuelve omitido sin descargar', async () => {
    const primera = await syncPrefecturaHistorico({
      ahora: AHORA,
      fetchImpl: vi.fn(async () => htmlOk(fixture)) as unknown as typeof fetch,
      esperar: sinEsperar,
      minLecturas: MIN_PRUEBA,
    })
    expect(primera).toMatchObject({ ejecutado: true, estado: 'completo' })

    const fetchImpl = vi.fn(async () => htmlOk(fixture))
    const segunda = await syncPrefecturaHistorico({
      ahora: AHORA,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      esperar: sinEsperar,
      minLecturas: MIN_PRUEBA,
    })

    expect(segunda).toEqual({ ejecutado: false, estado: 'omitido' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
