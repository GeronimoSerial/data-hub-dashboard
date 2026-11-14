import { readFileSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb, migrarDb } from '@/lib/db'
import { hazardSourceHealth, hidroLectura, infraJobRun } from '@/lib/db/schema'
import { syncSgbNiveis } from './sync-sgb-niveis'

// seed: false; migrations are applied explicitly in beforeAll.
usarDbTemporal('sync-sgb-niveis-', { seed: false })

const csvFixture = readFileSync(
  new URL('./__fixtures__/sgb/sace-manaos-cota-2026-11-12_13.csv', import.meta.url),
  'utf8',
)

// Fixture: 60 lecturas de 2026-11-12 10:00 a 2026-11-13 01:45 (hora SACE, UTC-2 efectivo),
// es decir 12:00Z a 03:45Z, niveles entre 16.28 y 16.31 m.
const CANTIDAD_FIXTURE = 60
const AHORA = new Date('2026-11-13T12:00:00.000Z')
const PRIMERA_MEDIDA = '2026-11-12T12:00:00.000Z'

function csvOk(cuerpo: string): Response {
  return new Response(cuerpo, {
    status: 200,
    headers: { 'content-type': 'text/csv; charset=utf-8' },
  })
}

describe('syncSgbNiveis', () => {
  let db: ReturnType<typeof getDb>

  beforeAll(async () => {
    await migrarDb()
    db = getDb()
  })

  beforeEach(async () => {
    await db.delete(hidroLectura)
    await db.delete(infraJobRun)
    await db.delete(hazardSourceHealth)
  })

  it('guarda las 60 lecturas de SACE como fuente sgb y publica completado con contadores', async () => {
    const fetchImpl = vi.fn(async () => csvOk(csvFixture))

    const resultado = await syncSgbNiveis({ ahora: AHORA, fetchImpl })

    expect(resultado).toMatchObject({
      ejecutado: true,
      estado: 'completo',
      contadores: {
        filasRecibidas: CANTIDAD_FIXTURE,
        descartadas: 0,
        insertadas: CANTIDAD_FIXTURE,
        duplicadas: 0,
        inconsistentes: 0,
      },
    })
    const filas = await db.select().from(hidroLectura)
    expect(filas).toHaveLength(CANTIDAD_FIXTURE)
    expect(filas.every((f) => f.fuente === 'sgb')).toBe(true)
    expect(filas.every((f) => f.estacionId === 'amazonas_8')).toBe(true)
    expect(filas.every((f) => f.catalogoVersion === 'sace-amazonas_8-v1')).toBe(true)
    expect(filas.every((f) => f.capturadaEn === AHORA.toISOString())).toBe(true)

    const primera = filas.find((f) => f.medidaEn === PRIMERA_MEDIDA)
    expect(primera).toMatchObject({ lecturaM: 16.29, estadoPublicado: 'normal', variacionM: null })

    const [job] = await db.select().from(infraJobRun)
    expect(job).toMatchObject({
      tipo: 'sync-sgb-niveis',
      claveIdempotente: '2026-11-13T12',
      estado: 'completado',
    })

    const [salud] = await db
      .select()
      .from(hazardSourceHealth)
      .where(eq(hazardSourceHealth.provider, 'sgb-niveis'))
    expect(salud).toMatchObject({
      estado: 'ok',
      ttlMinutos: 120,
      licencia: 'SGB — SACE, dados públicos; atribuição ao SGB; licença por confirmar',
      ultimoErrorSaneado: null,
    })
  })

  it('una segunda corrida con las mismas lecturas en otra hora UTC no duplica nada', async () => {
    const fetchImpl = vi.fn(async () => csvOk(csvFixture))
    await syncSgbNiveis({ ahora: AHORA, fetchImpl })

    const segunda = await syncSgbNiveis({
      ahora: new Date('2026-11-13T13:00:00.000Z'),
      fetchImpl,
    })

    expect(segunda).toMatchObject({
      ejecutado: true,
      estado: 'completo',
      contadores: { insertadas: 0, duplicadas: CANTIDAD_FIXTURE },
    })
    expect(await db.select().from(hidroLectura)).toHaveLength(CANTIDAD_FIXTURE)
    const claves = (await db.select().from(infraJobRun)).map((j) => j.claveIdempotente).sort()
    expect(claves).toEqual(['2026-11-13T12', '2026-11-13T13'])
  })

  it('una segunda ejecución en la misma hora UTC se omite sin descargar', async () => {
    const fetchImpl = vi.fn(async () => csvOk(csvFixture))
    await syncSgbNiveis({ ahora: AHORA, fetchImpl })

    const segunda = await syncSgbNiveis({
      ahora: new Date('2026-11-13T12:30:00.000Z'),
      fetchImpl,
    })

    expect(segunda).toMatchObject({ ejecutado: false, estado: 'omitido' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(await db.select().from(infraJobRun)).toHaveLength(1)
  })

  it('clasifica normal, alerta y evacuación en los umbrales exactos de la estación', async () => {
    // 26.99 m queda normal; 27.00 m alcanza la alerta; 29.00 m alcanza la evacuación.
    const csv = [
      'data_hora_medicao;indice',
      '2026-11-12 10:00:00;2699',
      '2026-11-12 10:15:00;2700',
      '2026-11-12 10:30:00;2900',
    ].join('\n')

    const resultado = await syncSgbNiveis({ ahora: AHORA, fetchImpl: vi.fn(async () => csvOk(csv)) })

    expect(resultado).toMatchObject({ ejecutado: true, estado: 'completo' })
    const filas = await db.select().from(hidroLectura)
    const estadoPor = (medida: string) => filas.find((f) => f.medidaEn === medida)?.estadoPublicado
    expect(estadoPor('2026-11-12T12:00:00.000Z')).toBe('normal')
    expect(estadoPor('2026-11-12T12:15:00.000Z')).toBe('alerta')
    expect(estadoPor('2026-11-12T12:30:00.000Z')).toBe('evacuacion')
  })

  it('marca como inconsistentes las lecturas posteriores a ahora más 15 minutos y las guarda igual', async () => {
    // Con ahora a las 12:00Z del 12/11, las lecturas desde 12:30Z son futuras.
    // La de 12:15Z (justo ahora + 15 min) no lo es.
    const ahoraTemprano = new Date('2026-11-12T12:00:00.000Z')

    const resultado = await syncSgbNiveis({
      ahora: ahoraTemprano,
      fetchImpl: vi.fn(async () => csvOk(csvFixture)),
    })

    expect(resultado).toMatchObject({
      ejecutado: true,
      estado: 'completo',
      contadores: { insertadas: CANTIDAD_FIXTURE, inconsistentes: 58 },
    })
    const filas = await db.select().from(hidroLectura)
    expect(filas.filter((f) => f.inconsistente)).toHaveLength(58)
    expect(filas.find((f) => f.medidaEn === '2026-11-12T12:15:00.000Z')?.inconsistente).toBe(false)
    const futura = filas.find((f) => f.medidaEn === '2026-11-12T12:30:00.000Z')
    expect(futura).toMatchObject({ inconsistente: true, motivosInconsistencia: ['marca_futura'] })
  })

  it('una respuesta con sólo cabecera publica fallido sin guardar nada y salud no_disponible', async () => {
    const soloCabecera = 'data_hora_medicao;indice\n'

    const resultado = await syncSgbNiveis({
      ahora: AHORA,
      fetchImpl: vi.fn(async () => csvOk(soloCabecera)),
    })

    expect(resultado).toEqual({
      ejecutado: false,
      estado: 'fallido',
      mensaje: 'La serie de SACE no contiene lecturas',
    })
    expect(await db.select().from(hidroLectura)).toHaveLength(0)
    const [job] = await db.select().from(infraJobRun)
    expect(job).toMatchObject({
      estado: 'fallido',
      errorSaneado: 'La serie de SACE no contiene lecturas',
    })
    const [salud] = await db
      .select()
      .from(hazardSourceHealth)
      .where(eq(hazardSourceHealth.provider, 'sgb-niveis'))
    expect(salud?.estado).toBe('no_disponible')
  })

  it('HTTP 503 publica fallido con mensaje fijo y salud no_disponible sin filtrar el cuerpo', async () => {
    const fetchImpl = vi.fn(async () => new Response('caído apikey=SECRETO-123', { status: 503 }))

    const resultado = await syncSgbNiveis({ ahora: AHORA, fetchImpl })

    expect(resultado).toEqual({ ejecutado: false, estado: 'fallido', mensaje: 'HTTP 503' })
    const [job] = await db.select().from(infraJobRun)
    expect(job).toMatchObject({ estado: 'fallido', errorSaneado: 'HTTP 503' })
    const [salud] = await db
      .select()
      .from(hazardSourceHealth)
      .where(eq(hazardSourceHealth.provider, 'sgb-niveis'))
    expect(salud?.estado).toBe('no_disponible')
    expect(salud?.ultimoErrorSaneado).not.toContain('SECRETO')
  })

  it('HTTP 429 registra salud degradado con el mensaje de límite de consultas', async () => {
    const fetchImpl = vi.fn(async () => new Response('rate limit apikey=SECRETO-123', { status: 429 }))

    const resultado = await syncSgbNiveis({ ahora: AHORA, fetchImpl })

    expect(resultado).toMatchObject({ ejecutado: false, estado: 'fallido', mensaje: 'HTTP 429' })
    const [salud] = await db
      .select()
      .from(hazardSourceHealth)
      .where(eq(hazardSourceHealth.provider, 'sgb-niveis'))
    expect(salud?.estado).toBe('degradado')
    expect(salud?.ultimoErrorSaneado).toBe('SGB limitó las consultas (HTTP 429)')
  })

  it('una respuesta HTML publica fallido con mensaje fijo sin filtrar el cuerpo', async () => {
    const fetchImpl = vi.fn(async () =>
      csvOk('<!doctype html><html><body>SECRETO-123 mantenimiento</body></html>'),
    )

    const resultado = await syncSgbNiveis({ ahora: AHORA, fetchImpl })

    expect(resultado).toEqual({
      ejecutado: false,
      estado: 'fallido',
      mensaje: 'La respuesta de SACE no es un CSV válido',
    })
    expect(await db.select().from(hidroLectura)).toHaveLength(0)
    const [job] = await db.select().from(infraJobRun)
    expect(job?.errorSaneado).toBe('La respuesta de SACE no es un CSV válido')
    expect(job?.errorSaneado).not.toContain('SECRETO')
    const [salud] = await db
      .select()
      .from(hazardSourceHealth)
      .where(eq(hazardSourceHealth.provider, 'sgb-niveis'))
    expect(salud?.estado).toBe('no_disponible')
  })
})
