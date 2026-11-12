import { readFileSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb, migrarDb } from '@/lib/db'
import { hazardSourceHealth, hidroLectura, infraJobRun } from '@/lib/db/schema'
import { actualizarSaludFuente } from '../riesgo/jobs/salud-fuente'
import type * as SaludFuente from '../riesgo/jobs/salud-fuente'
import { buscarEstacionPrefectura } from './estaciones-prefectura'
import { parsearAlturasPrefectura } from './prefectura-parser'
import { syncPrefecturaAlturas } from './sync-prefectura-alturas'

vi.mock('../riesgo/jobs/salud-fuente', async (importOriginal) => {
  const real = await importOriginal<typeof SaludFuente>()
  return { ...real, actualizarSaludFuente: vi.fn(real.actualizarSaludFuente) }
})

// seed: false; migrations are applied explicitly in beforeAll.
usarDbTemporal('sync-prefectura-alturas-', { seed: false })

const fixture = readFileSync(
  new URL('./__fixtures__/prefectura-index.html', import.meta.url),
  'utf8',
)

const AHORA = new Date('2026-10-13T12:30:00.000Z')
const sinEsperar = async () => {}

function htmlOk(cuerpo: string): Response {
  return new Response(cuerpo, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}

// Expected counts are derived from the same pure modules the job uses, so the
// test asserts the wiring and the publication, not a hand-copied number.
const filasFixture = parsearAlturasPrefectura(fixture)
const estacionesEsperadas = filasFixture.filter((f) => buscarEstacionPrefectura(f) !== null).length

describe('syncPrefecturaAlturas', () => {
  let db: ReturnType<typeof getDb>

  beforeAll(async () => {
    await migrarDb()
    db = getDb()
  })

  beforeEach(async () => {
    await db.delete(hidroLectura)
    await db.delete(infraJobRun)
    await db.delete(hazardSourceHealth)
    vi.mocked(actualizarSaludFuente).mockClear()
  })

  it('guarda sólo las estaciones del catálogo y publica completado con contadores', async () => {
    expect(estacionesEsperadas).toBeGreaterThan(0)
    const fetchImpl = vi.fn(async () => htmlOk(fixture))

    const resultado = await syncPrefecturaAlturas({ ahora: AHORA, fetchImpl, esperar: sinEsperar })

    expect(resultado).toMatchObject({ ejecutado: true, estado: 'completo' })
    const filas = await db.select().from(hidroLectura)
    expect(filas.length).toBeGreaterThan(0)
    expect(filas.every((f) => f.catalogoVersion === 'estaciones-prefectura-v2')).toBe(true)
    expect(filas.every((f) => f.capturadaEn === AHORA.toISOString())).toBe(true)

    const [job] = await db.select().from(infraJobRun)
    expect(job).toMatchObject({
      tipo: 'sync-prefectura-alturas',
      claveIdempotente: '2026-10-13T12',
      estado: 'completado',
    })
    const contadores = job?.contadores as Record<string, number>
    expect(contadores).toMatchObject({
      filasPublicadas: filasFixture.length,
      estacionesCatalogo: estacionesEsperadas,
      desconocidas: filasFixture.length - estacionesEsperadas,
      duplicadas: 0,
    })
    expect(contadores.insertadas + contadores.sinFecha).toBe(estacionesEsperadas)
    expect(contadores.insertadas).toBe(filas.length)

    const [salud] = await db
      .select()
      .from(hazardSourceHealth)
      .where(eq(hazardSourceHealth.provider, 'prefectura-alturas'))
    expect(salud).toMatchObject({
      estado: 'ok',
      ttlMinutos: 120,
      licencia: 'Prefectura Naval Argentina — sin términos publicados; atribución a PNA',
      ultimoErrorSaneado: null,
    })
  })

  it('una segunda ejecución en la misma hora UTC es idempotente: se omite sin descargar ni duplicar', async () => {
    const fetchImpl = vi.fn(async () => htmlOk(fixture))
    await syncPrefecturaAlturas({ ahora: AHORA, fetchImpl, esperar: sinEsperar })
    const filasAntes = (await db.select().from(hidroLectura)).length

    const segunda = await syncPrefecturaAlturas({
      ahora: new Date('2026-10-13T12:45:00.000Z'),
      fetchImpl,
      esperar: sinEsperar,
    })

    expect(segunda).toMatchObject({ ejecutado: false, estado: 'omitido' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(await db.select().from(hidroLectura)).toHaveLength(filasAntes)
    expect(await db.select().from(infraJobRun)).toHaveLength(1)
  })

  it('una ejecución en otra hora UTC corre de nuevo con su propia clave', async () => {
    const fetchImpl = vi.fn(async () => htmlOk(fixture))
    await syncPrefecturaAlturas({ ahora: AHORA, fetchImpl, esperar: sinEsperar })

    const siguiente = await syncPrefecturaAlturas({
      ahora: new Date('2026-10-13T13:05:00.000Z'),
      fetchImpl,
      esperar: sinEsperar,
    })

    expect(siguiente).toMatchObject({ ejecutado: true, estado: 'completo' })
    const claves = (await db.select().from(infraJobRun)).map((j) => j.claveIdempotente).sort()
    expect(claves).toEqual(['2026-10-13T12', '2026-10-13T13'])
  })

  it('HTTP 429 publica fallido con mensaje fijo y salud degradado sin filtrar el cuerpo', async () => {
    const fetchImpl = vi.fn(async () => new Response('rate limit apikey=SECRETO-123', { status: 429 }))

    const resultado = await syncPrefecturaAlturas({
      ahora: new Date('2026-10-13T13:10:00.000Z'),
      fetchImpl,
      esperar: sinEsperar,
    })

    expect(resultado).toMatchObject({ ejecutado: false, estado: 'fallido' })
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    const [job] = await db.select().from(infraJobRun)
    expect(job).toMatchObject({ estado: 'fallido', errorSaneado: 'HTTP 429' })
    const [salud] = await db
      .select()
      .from(hazardSourceHealth)
      .where(eq(hazardSourceHealth.provider, 'prefectura-alturas'))
    expect(salud?.estado).toBe('degradado')
    expect(salud?.ultimoErrorSaneado).toBe('Prefectura limitó las consultas (HTTP 429)')
    expect(salud?.ultimoErrorSaneado).not.toContain('SECRETO')
  })

  it('una tabla sin estaciones del catálogo publica fallido y no reporta éxito sobre nada', async () => {
    // Keep the table and its headers, but make every row unknown to the catalogue:
    // a neutral station name and a historical id that matches no catalogue entry.
    const sinCatalogo = fixture
      .replace(/&id=\d+/g, '&id=99999')
      .replace(/(data-label="Puerto:">)[^<]*</g, '$1ESTACION INEXISTENTE<')
    const fetchImpl = vi.fn(async () => htmlOk(sinCatalogo))

    const resultado = await syncPrefecturaAlturas({
      ahora: new Date('2026-10-13T14:00:00.000Z'),
      fetchImpl,
      esperar: sinEsperar,
    })

    expect(resultado).toMatchObject({ ejecutado: false, estado: 'fallido' })
    expect(await db.select().from(hidroLectura)).toHaveLength(0)
    const [job] = await db.select().from(infraJobRun)
    expect(job).toMatchObject({ estado: 'fallido' })
    expect(job?.errorSaneado).toContain('catálogo')
    const [salud] = await db
      .select()
      .from(hazardSourceHealth)
      .where(eq(hazardSourceHealth.provider, 'prefectura-alturas'))
    expect(salud?.estado).toBe('no_disponible')
  })

  it('un fallo al escribir la salud tras un sync exitoso no altera el resultado publicado', async () => {
    vi.mocked(actualizarSaludFuente).mockRejectedValueOnce(new Error('SQLITE_BUSY hazard_source_health'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fetchImpl = vi.fn(async () => htmlOk(fixture))

    try {
      const resultado = await syncPrefecturaAlturas({
        ahora: new Date('2026-10-13T15:00:00.000Z'),
        fetchImpl,
        esperar: sinEsperar,
      })

      expect(resultado).toMatchObject({ ejecutado: true, estado: 'completo' })
      const [job] = await db.select().from(infraJobRun)
      expect(job).toMatchObject({ estado: 'completado' })
      expect(warn).toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  it('registra ok pasando las filas recibidas de la fuente, también cuando no se inserta ninguna nueva', async () => {
    const fetchImpl = vi.fn(async () => htmlOk(fixture))
    await syncPrefecturaAlturas({ ahora: AHORA, fetchImpl, esperar: sinEsperar })
    vi.mocked(actualizarSaludFuente).mockClear()

    const resultado = await syncPrefecturaAlturas({
      ahora: new Date('2026-10-13T15:00:00.000Z'),
      fetchImpl,
      esperar: sinEsperar,
    })

    // Precondición del caso: todas las lecturas ya estaban, no se insertó nada.
    expect(resultado).toMatchObject({ ejecutado: true, estado: 'completo' })
    const contadores = resultado.estado === 'completo' ? resultado.contadores : undefined
    expect(contadores?.insertadas).toBe(0)
    expect(contadores?.duplicadas).toBe(estacionesEsperadas)

    expect(actualizarSaludFuente).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        estado: 'ok',
        filasRecibidas: filasFixture.length,
      }),
    )
    const salud = await db
      .select()
      .from(hazardSourceHealth)
      .where(eq(hazardSourceHealth.provider, 'prefectura-alturas'))
    expect(salud[0]?.estado).toBe('ok')
  })
})
