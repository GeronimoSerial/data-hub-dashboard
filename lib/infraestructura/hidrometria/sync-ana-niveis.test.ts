import { readFileSync } from 'node:fs'
import { and, eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb, migrarDb } from '@/lib/db'
import { hazardSourceHealth, hidroLectura, infraJobRun } from '@/lib/db/schema'
import { estadoReferencias } from '@/lib/infraestructura/datasets/memoria'
import { adquirirLease } from '../riesgo/job-run'
import { actualizarSaludFuente } from '../riesgo/jobs/salud-fuente'
import type * as SaludFuente from '../riesgo/jobs/salud-fuente'
import { obtenerVersionCatalogoAna } from './estaciones-ana'
import { syncAnaNiveis } from './sync-ana-niveis'

vi.mock('../riesgo/jobs/salud-fuente', async (importOriginal) => {
  const real = await importOriginal<typeof SaludFuente>()
  return { ...real, actualizarSaludFuente: vi.fn(real.actualizarSaludFuente) }
})

// seed: false; migrations are applied explicitly in beforeAll.
usarDbTemporal('sync-ana-niveis-', { seed: false })

const fixture = readFileSync(
  new URL('./__fixtures__/ana/dados-14990000-2026-11-12_13.xml', import.meta.url),
  'utf8',
)

// Catálogo publicado de ANA: el mismo documento que el importador escribe en data/regiones.
const catalogoAna = JSON.parse(
  readFileSync(new URL('../../../data/regiones/manaos/estacoes-ana.json', import.meta.url), 'utf8'),
) as { revision: string; datos: unknown[] }

const AHORA = new Date('2026-11-13T04:00:00.000Z')
const ESTACION_CON_UMBRALES = '14990000'
const ESTACION_SIN_UMBRALES = '14100000'
const FILAS_POR_ESTACION = 24
const MENSAJE_GENERICO = 'Fallo al sincronizar niveles de ANA'
const MENSAJE_LIMITE = 'ANA limitó las consultas (HTTP 429)'

function xmlOk(cuerpo: string = fixture): Response {
  return new Response(cuerpo, {
    status: 200,
    headers: { 'content-type': 'text/xml; charset=utf-8' },
  })
}

// Una respuesta distinta por estación, leída del parámetro codEstacao de la URL.
function fetchPorEstacion(respuesta: (codigo: string) => Response) {
  return vi.fn(async (url: string | URL | Request) =>
    respuesta(new URL(String(url)).searchParams.get('codEstacao') ?? ''),
  )
}

// XML mínimo con la forma de DadosHidrometereologicos; hora en Brasília, nivel en cm.
function xmlNiveles(filas: Array<[dataHora: string, nivelCm: string]>): string {
  const cuerpo = filas
    .map(
      ([dataHora, nivelCm]) =>
        `<DadosHidrometereologicos><CodEstacao>14990000</CodEstacao><DataHora>${dataHora}</DataHora><Vazao /><Nivel>${nivelCm}</Nivel><Chuva>0.00</Chuva></DadosHidrometereologicos>`,
    )
    .join('')
  return `<DataTable xmlns="http://MRCS/"><DocumentElement xmlns="">${cuerpo}</DocumentElement></DataTable>`
}

describe('syncAnaNiveis', () => {
  let db: ReturnType<typeof getDb>

  beforeAll(async () => {
    await migrarDb()
    db = getDb()
    estadoReferencias().referencias.set('estacoes-ana', {
      versionId: catalogoAna.revision,
      revision: catalogoAna.revision,
      documento: catalogoAna.datos,
    })
  })

  beforeEach(async () => {
    await db.delete(hidroLectura)
    await db.delete(infraJobRun)
    await db.delete(hazardSourceHealth)
    vi.mocked(actualizarSaludFuente).mockClear()
  })

  it('guarda las lecturas de ambas estaciones con fuente ana y clasifica el nivel por umbral', async () => {
    const fetchImpl = fetchPorEstacion(() => xmlOk())

    const resultado = await syncAnaNiveis({ ahora: AHORA, fetchImpl })

    expect(resultado).toMatchObject({ ejecutado: true, estado: 'completo' })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    const filas = await db.select().from(hidroLectura)
    expect(filas).toHaveLength(2 * FILAS_POR_ESTACION)
    expect(filas.every((f) => f.fuente === 'ana')).toBe(true)
    expect(filas.every((f) => f.catalogoVersion === obtenerVersionCatalogoAna())).toBe(true)
    expect(filas.every((f) => f.capturadaEn === AHORA.toISOString())).toBe(true)

    const [ultima] = await db
      .select()
      .from(hidroLectura)
      .where(
        and(
          eq(hidroLectura.estacionId, ESTACION_CON_UMBRALES),
          eq(hidroLectura.medidaEn, '2026-11-13T03:45:00.000Z'),
        ),
      )
    expect(ultima).toMatchObject({
      lecturaM: 16.28,
      estadoPublicado: 'normal',
      alertaM: 27,
      evacuacionM: 29,
      inconsistente: false,
    })

    const sinUmbral = filas.filter((f) => f.estacionId === ESTACION_SIN_UMBRALES)
    expect(sinUmbral).toHaveLength(FILAS_POR_ESTACION)
    expect(sinUmbral.every((f) => f.estadoPublicado === 'sin_umbral')).toBe(true)
    expect(sinUmbral.every((f) => f.alertaM === null && f.evacuacionM === null)).toBe(true)

    const [job] = await db.select().from(infraJobRun)
    expect(job).toMatchObject({
      tipo: 'sync-ana-niveis',
      claveIdempotente: '2026-11-13T04',
      estado: 'completado',
    })
    expect(job?.contadores).toEqual({
      filasRecibidas: 2 * FILAS_POR_ESTACION,
      estaciones: 2,
      estacionesConError: 0,
      insertadas: 2 * FILAS_POR_ESTACION,
      duplicadas: 0,
      inconsistentes: 0,
      sinNivel: 0,
    })

    const [salud] = await db
      .select()
      .from(hazardSourceHealth)
      .where(eq(hazardSourceHealth.provider, 'ana-niveis'))
    expect(salud).toMatchObject({
      estado: 'ok',
      ttlMinutos: 120,
      licencia: 'ANA — dados públicos (telemetria); atribuição à ANA; licença por confirmar',
      ultimoErrorSaneado: null,
    })
    expect(actualizarSaludFuente).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ estado: 'ok', filasRecibidas: 2 * FILAS_POR_ESTACION }),
    )
  })

  it('un nivel igual al umbral cuenta como alcanzado: alerta en 27,00 m y evacuación en 29,00 m', async () => {
    const fetchImpl = fetchPorEstacion((codigo) =>
      codigo === ESTACION_CON_UMBRALES
        ? xmlOk(xmlNiveles([
            ['2026-11-13 00:00:00', '2700'],
            ['2026-11-13 01:00:00', '2900'],
          ]))
        : xmlOk('Sem dados'),
    )

    await syncAnaNiveis({ ahora: AHORA, fetchImpl })

    const filas = await db
      .select()
      .from(hidroLectura)
      .where(eq(hidroLectura.estacionId, ESTACION_CON_UMBRALES))
    const porMedida = Object.fromEntries(filas.map((f) => [f.medidaEn, f]))
    expect(porMedida['2026-11-13T03:00:00.000Z']).toMatchObject({ lecturaM: 27, estadoPublicado: 'alerta', variacionM: null })
    expect(porMedida['2026-11-13T04:00:00.000Z']).toMatchObject({ lecturaM: 29, estadoPublicado: 'evacuacion', variacionM: 2 })
  })

  it('una segunda ejecución en otra hora no inserta nada y publica completado', async () => {
    const fetchImpl = fetchPorEstacion(() => xmlOk())
    await syncAnaNiveis({ ahora: AHORA, fetchImpl })

    const segunda = await syncAnaNiveis({
      ahora: new Date('2026-11-13T05:00:00.000Z'),
      fetchImpl,
    })

    expect(segunda).toMatchObject({ ejecutado: true, estado: 'completo' })
    expect(await db.select().from(hidroLectura)).toHaveLength(2 * FILAS_POR_ESTACION)
    const jobs = await db.select().from(infraJobRun)
    expect(jobs).toHaveLength(2)
    const segundo = jobs.find((j) => j.claveIdempotente === '2026-11-13T05' && j.estado === 'completado')
    expect(segundo).toBeDefined()
    expect(segundo?.contadores).toMatchObject({ insertadas: 0, duplicadas: 2 * FILAS_POR_ESTACION })
  })

  it('una lectura con marca posterior a ahora + 15 min se guarda como inconsistente por marca_futura', async () => {
    // Con ahora a las 00:00Z, las lecturas posteriores a 00:15Z son futuras.
    // Del XML de la fixture (hora de Brasília + 3 h), 14 por estación quedan fuera de ese margen.
    const fetchImpl = fetchPorEstacion(() => xmlOk())

    const resultado = await syncAnaNiveis({ ahora: new Date('2026-11-13T00:00:00.000Z'), fetchImpl })

    expect(resultado).toMatchObject({ ejecutado: true, estado: 'completo' })
    const inconsistentes = await db
      .select()
      .from(hidroLectura)
      .where(eq(hidroLectura.inconsistente, true))
    expect(inconsistentes).toHaveLength(28)
    expect(inconsistentes.every((f) => f.motivosInconsistencia.join() === 'marca_futura')).toBe(true)

    const [futura] = await db
      .select()
      .from(hidroLectura)
      .where(
        and(
          eq(hidroLectura.estacionId, ESTACION_CON_UMBRALES),
          eq(hidroLectura.medidaEn, '2026-11-13T03:45:00.000Z'),
        ),
      )
    expect(futura).toMatchObject({ inconsistente: true, motivosInconsistencia: ['marca_futura'] })

    const [pasada] = await db
      .select()
      .from(hidroLectura)
      .where(
        and(
          eq(hidroLectura.estacionId, ESTACION_CON_UMBRALES),
          eq(hidroLectura.medidaEn, '2026-11-12T22:00:00.000Z'),
        ),
      )
    expect(pasada).toMatchObject({ inconsistente: false, motivosInconsistencia: [] })
  })

  it('HTTP 500 en una estación completa el job con contadores parciales y salud degradado', async () => {
    const fetchImpl = fetchPorEstacion((codigo) =>
      codigo === ESTACION_SIN_UMBRALES
        ? new Response('error interno', { status: 500 })
        : xmlOk(),
    )

    const resultado = await syncAnaNiveis({ ahora: AHORA, fetchImpl })

    expect(resultado).toMatchObject({ ejecutado: true, estado: 'completo' })
    const filas = await db.select().from(hidroLectura)
    expect(filas).toHaveLength(FILAS_POR_ESTACION)
    expect(filas.every((f) => f.estacionId === ESTACION_CON_UMBRALES)).toBe(true)

    const [job] = await db.select().from(infraJobRun)
    expect(job).toMatchObject({ estado: 'completado' })
    expect(job?.contadores).toMatchObject({ estaciones: 2, estacionesConError: 1, insertadas: FILAS_POR_ESTACION })

    const [salud] = await db
      .select()
      .from(hazardSourceHealth)
      .where(eq(hazardSourceHealth.provider, 'ana-niveis'))
    expect(salud).toMatchObject({ estado: 'degradado', ultimoErrorSaneado: 'fallo parcial al consultar estaciones de ANA' })
  })

  it('todas las estaciones fallan con HTTP 500: job fallido con mensaje fijo y sin cuerpo de respuesta', async () => {
    const fetchImpl = fetchPorEstacion(() => new Response('apikey=SECRETO-123', { status: 500 }))

    const resultado = await syncAnaNiveis({ ahora: AHORA, fetchImpl })

    expect(resultado).toEqual({ ejecutado: false, estado: 'fallido', mensaje: MENSAJE_GENERICO })
    const [job] = await db.select().from(infraJobRun)
    expect(job).toMatchObject({ estado: 'fallido', errorSaneado: MENSAJE_GENERICO })
    expect(JSON.stringify(job)).not.toContain('SECRETO')
    expect(await db.select().from(hidroLectura)).toHaveLength(0)

    const [salud] = await db
      .select()
      .from(hazardSourceHealth)
      .where(eq(hazardSourceHealth.provider, 'ana-niveis'))
    expect(salud).toMatchObject({ estado: 'no_disponible', ultimoErrorSaneado: MENSAJE_GENERICO })
    expect(JSON.stringify(salud)).not.toContain('SECRETO')
  })

  it('todas las estaciones con HTTP 429 publican salud degradado con el mensaje de límite', async () => {
    const fetchImpl = fetchPorEstacion(() => new Response('rate limit', { status: 429 }))

    const resultado = await syncAnaNiveis({ ahora: AHORA, fetchImpl })

    expect(resultado).toEqual({ ejecutado: false, estado: 'fallido', mensaje: MENSAJE_LIMITE })
    const [job] = await db.select().from(infraJobRun)
    expect(job).toMatchObject({ estado: 'fallido', errorSaneado: MENSAJE_LIMITE })
    const [salud] = await db
      .select()
      .from(hazardSourceHealth)
      .where(eq(hazardSourceHealth.provider, 'ana-niveis'))
    expect(salud).toMatchObject({ estado: 'degradado', ultimoErrorSaneado: MENSAJE_LIMITE })
  })

  it('con el lease de la misma hora ya tomado se omite sin descargar', async () => {
    const lease = await adquirirLease({
      tipo: 'sync-ana-niveis',
      claveIdempotente: '2026-11-13T04',
      version: obtenerVersionCatalogoAna(),
      duracionLeaseMs: 10 * 60 * 1000,
      ahora: AHORA,
    })
    expect(lease).toMatchObject({ adquirido: true })
    const fetchImpl = fetchPorEstacion(() => xmlOk())

    const resultado = await syncAnaNiveis({ ahora: AHORA, fetchImpl })

    expect(resultado).toEqual({ ejecutado: false, estado: 'omitido' })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(await db.select().from(hidroLectura)).toHaveLength(0)
  })
})
