import { readFileSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb, migrarDb } from '@/lib/db'
import { hazardSourceHealth, infraJobRun, lluviaEstacion } from '@/lib/db/schema'
import { actualizarSaludFuente } from '../riesgo/jobs/salud-fuente'
import type * as SaludFuente from '../riesgo/jobs/salud-fuente'
import { ESTACIONES_SYNOP } from './estaciones-synop'
import { parsearRespuestaOgimet } from './synop-parser'
import { syncSynopLluvia } from './sync-synop-lluvia'

vi.mock('../riesgo/jobs/salud-fuente', async (importOriginal) => {
  const real = await importOriginal<typeof SaludFuente>()
  return { ...real, actualizarSaludFuente: vi.fn(real.actualizarSaludFuente) }
})

// seed: false; migrations are applied explicitly in beforeAll.
usarDbTemporal('sync-synop-lluvia-', { seed: false })

const fixture = readFileSync(
  new URL('./__fixtures__/ogimet-87166-20261013.txt', import.meta.url),
  'utf8',
)

const AHORA = new Date('2026-10-13T12:30:00.000Z')
const sinEsperar = async () => {}
const registrosFixture = parsearRespuestaOgimet(fixture)

// Ogimet responde por estación: sólo Corrientes Aero (87166) tiene datos en el fixture.
function fetchOgimet(porWmo: Record<string, () => Response | Promise<Response>> = {}) {
  return vi.fn(async (url: Parameters<typeof fetch>[0]) => {
    const wmo = new URL(String(url)).searchParams.get('block') ?? ''
    const manejador = porWmo[wmo]
    if (manejador) return manejador()
    const cuerpo = wmo === '87166' ? fixture : ''
    return new Response(cuerpo, { status: 200, headers: { 'content-type': 'text/plain' } })
  })
}

describe('syncSynopLluvia', () => {
  let db: ReturnType<typeof getDb>

  beforeAll(async () => {
    await migrarDb()
    db = getDb()
  })

  beforeEach(async () => {
    await db.delete(lluviaEstacion)
    await db.delete(infraJobRun)
    await db.delete(hazardSourceHealth)
    vi.mocked(actualizarSaludFuente).mockClear()
  })

  it('consulta una vez cada estación con pausa entre peticiones y guarda lo decodificado', async () => {
    expect(registrosFixture.length).toBeGreaterThan(0)
    const fetchImpl = fetchOgimet()
    const esperar = vi.fn(async (_ms: number) => {})

    const resultado = await syncSynopLluvia({ ahora: AHORA, fetchImpl, esperar })

    expect(resultado).toMatchObject({ ejecutado: true, estado: 'completo' })
    expect(fetchImpl).toHaveBeenCalledTimes(ESTACIONES_SYNOP.length)
    expect(esperar).toHaveBeenCalledTimes(ESTACIONES_SYNOP.length - 1)
    expect(esperar.mock.calls.every(([ms]) => ms === 2000)).toBe(true)

    const filas = await db.select().from(lluviaEstacion)
    expect(filas).toHaveLength(new Set(registrosFixture.map((r) => `${r.observadoEn}|${r.periodoHoras}|${r.seccion}`)).size)
    expect(filas.every((f) => f.estacionWmo === '87166')).toBe(true)
    expect(filas.every((f) => f.capturadaEn === AHORA.toISOString())).toBe(true)
    expect(filas.every((f) => f.fuente === 'ogimet-synop')).toBe(true)

    const [job] = await db.select().from(infraJobRun)
    expect(job).toMatchObject({
      tipo: 'sync-synop-lluvia',
      claveIdempotente: '2026-10-13T12',
      estado: 'completado',
    })
    expect(job?.contadores).toMatchObject({
      estaciones: ESTACIONES_SYNOP.length,
      estacionesConError: 0,
      registros: filas.length,
    })

    const [salud] = await db
      .select()
      .from(hazardSourceHealth)
      .where(eq(hazardSourceHealth.provider, 'ogimet-synop'))
    expect(salud).toMatchObject({
      estado: 'ok',
      ttlMinutos: 120,
      licencia:
        'Ogimet (ogimet.com) — datos SYNOP OMM/SMN; uso no comercial con atribución, baja tasa de consultas',
      ultimoErrorSaneado: null,
    })
  })

  it('una segunda ejecución en la misma hora UTC se omite sin descargar', async () => {
    const fetchImpl = fetchOgimet()
    await syncSynopLluvia({ ahora: AHORA, fetchImpl, esperar: sinEsperar })
    const filasAntes = (await db.select().from(lluviaEstacion)).length

    const segunda = await syncSynopLluvia({
      ahora: new Date('2026-10-13T12:45:00.000Z'),
      fetchImpl,
      esperar: sinEsperar,
    })

    expect(segunda).toMatchObject({ ejecutado: false, estado: 'omitido' })
    expect(fetchImpl).toHaveBeenCalledTimes(ESTACIONES_SYNOP.length)
    expect(await db.select().from(lluviaEstacion)).toHaveLength(filasAntes)
    expect(await db.select().from(infraJobRun)).toHaveLength(1)
  })

  it('un fallo en una estación no aborta el resto y se cuenta como error', async () => {
    const fetchImpl = fetchOgimet({
      '87155': () => new Response('x', { status: 500 }),
    })

    const resultado = await syncSynopLluvia({ ahora: AHORA, fetchImpl, esperar: sinEsperar })

    expect(resultado).toMatchObject({ ejecutado: true, estado: 'completo' })
    expect(fetchImpl).toHaveBeenCalledTimes(ESTACIONES_SYNOP.length)
    const [job] = await db.select().from(infraJobRun)
    expect(job?.contadores).toMatchObject({ estacionesConError: 1 })
    expect((await db.select().from(lluviaEstacion)).length).toBeGreaterThan(0)
  })

  it('si todas las estaciones fallan publica fallido con mensaje fijo y salud degradado en 429', async () => {
    const limite = () => new Response('apikey=SECRETO-123', { status: 429 })
    const fetchImpl = vi.fn(async () => limite())

    const resultado = await syncSynopLluvia({ ahora: AHORA, fetchImpl, esperar: sinEsperar })

    expect(resultado).toMatchObject({ ejecutado: false, estado: 'fallido' })
    const [job] = await db.select().from(infraJobRun)
    expect(job).toMatchObject({ estado: 'fallido', errorSaneado: expect.any(String) })
    expect(job?.errorSaneado).not.toContain('SECRETO')
    const [salud] = await db
      .select()
      .from(hazardSourceHealth)
      .where(eq(hazardSourceHealth.provider, 'ogimet-synop'))
    expect(salud?.estado).toBe('degradado')
    expect(salud?.ultimoErrorSaneado).toBe('Ogimet limitó las consultas (HTTP 429)')
    expect(salud?.ultimoErrorSaneado).not.toContain('SECRETO')
  })

  it('una segunda corrida con la misma medición actualiza sin duplicar', async () => {
    await syncSynopLluvia({ ahora: AHORA, fetchImpl: fetchOgimet(), esperar: sinEsperar })
    const primera = await db.select().from(lluviaEstacion)

    await syncSynopLluvia({
      ahora: new Date('2026-10-13T13:05:00.000Z'),
      fetchImpl: fetchOgimet(),
      esperar: sinEsperar,
    })

    const segunda = await db.select().from(lluviaEstacion)
    expect(segunda).toHaveLength(primera.length)
    expect(segunda.every((f) => f.capturadaEn === '2026-10-13T13:05:00.000Z')).toBe(true)
  })
})
