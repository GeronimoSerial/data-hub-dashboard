import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb } from '@/lib/db'
import { hazardClimatology, hazardPrecipitacionSerie, hazardSourceHealth, infraGeoProfile, infraJobRun } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import type { ejecutarCalculoClimatologiaImerg as EjecutarCalculoClimatologiaImerg } from './calcular-climatologia-imerg'
import { claveSerieImerg, VERSION_CLIMATOLOGIA_IMERG } from '../providers/climatologia-imerg'
import { diasDelAnio, guardarAnioSerie } from '../climatologia/serie-diaria'

usarDbTemporal('calcular-climatologia-imerg-')

let ejecutarCalculoClimatologiaImerg: typeof EjecutarCalculoClimatologiaImerg

// Refs que produce el CSV de fixture con celdaDeCoordenada: lat -27.45 redondea a
// -27.4 y lon -58.85 / -58.95 a -58.8 / -58.9 (Math.round con medio hacia +infinito).
const CELDA_A = '-27.4_-58.8'
const CELDA_B = '-27.4_-58.9'

const PROVIDER = 'nasa-imerg-climatologia'
const TOKEN = 'token-de-prueba-no-real'
const DIA_MS = 86_400_000

// Cada test usa un día UTC distinto: la clave del lease es período+versión+fecha.
const AHORA_A = new Date('2026-10-13T12:00:00.000Z')
const AHORA_B = new Date('2026-10-14T12:00:00.000Z')
const AHORA_C = new Date('2026-10-15T12:00:00.000Z')
const AHORA_D = new Date('2026-10-16T12:00:00.000Z')
const AHORA_E = new Date('2026-10-17T12:00:00.000Z')
const AHORA_F = new Date('2026-10-18T12:00:00.000Z')
const AHORA_G = new Date('2026-10-19T12:00:00.000Z')
const AHORA_H = new Date('2026-10-20T12:00:00.000Z')

const CSV_SUBSET = [
  'Dataset: x',
  '/lon, -58.85, -58.95',
  '/lat, -27.45, -27.35',
  '/precipitation[0][0], 1.5, 2',
  '/precipitation[0][1], 0, 3',
].join('\n')

function claveIdempotente(periodoHasta: string, ahora: Date): string {
  return `${periodoHasta}_${VERSION_CLIMATOLOGIA_IMERG}_${ahora.toISOString().slice(0, 10)}`
}

/** Fetch falso: CMR devuelve un gránulo por día del mes pedido; OPeNDAP devuelve el CSV fijo. */
function crearFetchFalso(opciones: { fallaSubsetDe?: string } = {}) {
  const urls: string[] = []
  const fetchImpl = async (entrada: string | URL | Request): Promise<Response> => {
    const url = String(entrada)
    urls.push(url)
    if (url.startsWith('https://cmr.earthdata.nasa.gov/')) {
      const temporal = new URL(url).searchParams.get('temporal') ?? ''
      const [desde, hasta] = temporal.split(',')
      const fin = Date.parse(`${hasta.slice(0, 10)}T00:00:00Z`)
      const entradas = []
      for (let t = Date.parse(`${desde.slice(0, 10)}T00:00:00Z`); t <= fin; t += DIA_MS) {
        const fecha = new Date(t).toISOString().slice(0, 10)
        entradas.push({
          time_start: `${fecha}T00:00:00.000Z`,
          links: [{ href: `https://opendap.earthdata.nasa.gov/x/${fecha}` }],
        })
      }
      return new Response(JSON.stringify({ feed: { entry: entradas } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    if (opciones.fallaSubsetDe && url.includes(`/x/${opciones.fallaSubsetDe}.dap.csv`)) {
      return new Response('upstream caído', { status: 503 })
    }
    return new Response(CSV_SUBSET, { status: 200, headers: { 'content-type': 'text/plain' } })
  }
  return { fetchImpl: fetchImpl as typeof fetch, urls }
}

const esSubset = (url: string) => url.includes('.dap.csv')

beforeAll(async () => {
  ;({ ejecutarCalculoClimatologiaImerg } = await import('./calcular-climatologia-imerg'))

  await getDb()
    .insert(infraGeoProfile)
    .values([
      {
        cueAnexo: '1800101-00',
        geometryRef: CELDA_A,
        lat: -27.4,
        lon: -58.8,
        motivoExclusion: null,
        perfilVersion: 'geo-perfil-v1',
        calculadoEn: '2026-09-26T00:00:00.000Z',
      },
      {
        cueAnexo: '1800102-00',
        geometryRef: CELDA_B,
        lat: -27.4,
        lon: -58.9,
        motivoExclusion: null,
        perfilVersion: 'geo-perfil-v1',
        calculadoEn: '2026-09-26T00:00:00.000Z',
      },
    ])
})

beforeEach(async () => {
  await getDb().delete(hazardPrecipitacionSerie)
})

describe('ejecutarCalculoClimatologiaImerg (descarga diaria IMERG)', () => {
  it('descarga el período, guarda la serie por celda y deja la salud en ok', async () => {
    const { fetchImpl, urls } = crearFetchFalso()

    const resultado = await ejecutarCalculoClimatologiaImerg({
      ahora: AHORA_A,
      earthdataToken: TOKEN,
      fetchImpl,
      diasPorCorrida: 100,
      periodoDesde: '2001-01-01',
      periodoHasta: '2001-02-28',
    })

    expect(resultado).toEqual({
      ok: true,
      resultado: {
        diasDescargados: 59,
        diasPendientes: 0,
        diasConError: 0,
        celdasConUmbral: 0,
        requests: 61,
        cortadoPorPresupuesto: false,
        error: null,
      },
    })

    const filas = await getDb()
      .select()
      .from(hazardPrecipitacionSerie)
      .where(eq(hazardPrecipitacionSerie.celdaEra5, claveSerieImerg(CELDA_A)))
    expect(filas).toHaveLength(1)
    expect(filas[0].anio).toBe(2001)
    expect(filas[0].valores[0]).toBe(1.5)

    const [salud] = await getDb().select().from(hazardSourceHealth).where(eq(hazardSourceHealth.provider, PROVIDER))
    expect(salud.estado).toBe('ok')
    expect(urls.filter(esSubset)).toHaveLength(59)
  })

  it('en una nueva corrida no vuelve a descargar días ya guardados', async () => {
    const { fetchImpl, urls } = crearFetchFalso()
    const periodo = { periodoDesde: '2001-01-01', periodoHasta: '2001-02-28', diasPorCorrida: 100 }

    await ejecutarCalculoClimatologiaImerg({ ahora: AHORA_G, earthdataToken: TOKEN, fetchImpl, ...periodo })
    urls.length = 0
    const resultado = await ejecutarCalculoClimatologiaImerg({
      ahora: AHORA_B,
      earthdataToken: TOKEN,
      fetchImpl,
      ...periodo,
    })

    expect(resultado).toMatchObject({ ok: true, resultado: { diasDescargados: 0, diasPendientes: 0, requests: 0 } })
    expect(urls.filter(esSubset)).toHaveLength(0)
  })

  it('corta por presupuesto al terminar el mes que excede diasPorCorrida', async () => {
    const { fetchImpl } = crearFetchFalso()

    const resultado = await ejecutarCalculoClimatologiaImerg({
      ahora: AHORA_C,
      earthdataToken: TOKEN,
      fetchImpl,
      diasPorCorrida: 31,
      periodoDesde: '2001-01-01',
      periodoHasta: '2001-02-28',
    })

    expect(resultado).toMatchObject({
      ok: true,
      resultado: { diasDescargados: 31, diasPendientes: 28, cortadoPorPresupuesto: true },
    })
  })

  it('ante un 503 descarta el mes completo, marca degradado y la corrida queda fallida', async () => {
    const { fetchImpl } = crearFetchFalso({ fallaSubsetDe: '2001-01-15' })

    const resultado = await ejecutarCalculoClimatologiaImerg({
      ahora: AHORA_D,
      earthdataToken: TOKEN,
      fetchImpl,
      diasPorCorrida: 100,
      periodoDesde: '2001-01-01',
      periodoHasta: '2001-02-28',
    })

    expect(resultado).toMatchObject({
      ok: true,
      resultado: { diasDescargados: 0, diasPendientes: 59, diasConError: 1, error: 'subset HTTP 503 2001-01-15' },
    })
    expect(await getDb().select().from(hazardPrecipitacionSerie)).toHaveLength(0)

    const [salud] = await getDb().select().from(hazardSourceHealth).where(eq(hazardSourceHealth.provider, PROVIDER))
    expect(salud.estado).toBe('degradado')
    expect(salud.ultimoErrorSaneado).toBe('subset HTTP 503 2001-01-15')

    const [corrida] = await getDb()
      .select()
      .from(infraJobRun)
      .where(eq(infraJobRun.claveIdempotente, claveIdempotente('2001-02-28', AHORA_D)))
    expect(corrida.estado).toBe('fallido')
  })

  it('sin token no descarga, marca no_disponible y la corrida queda fallida', async () => {
    const { fetchImpl, urls } = crearFetchFalso()

    const resultado = await ejecutarCalculoClimatologiaImerg({
      ahora: AHORA_E,
      fetchImpl,
      periodoDesde: '2001-01-01',
      periodoHasta: '2001-02-28',
    })

    expect(resultado).toEqual({ ok: false, motivo: 'sin_token' })
    expect(urls).toHaveLength(0)

    const [salud] = await getDb().select().from(hazardSourceHealth).where(eq(hazardSourceHealth.provider, PROVIDER))
    expect(salud.estado).toBe('no_disponible')
    expect(salud.ultimoErrorSaneado).toBe('falta EARTHDATA_TOKEN')

    const [corrida] = await getDb()
      .select()
      .from(infraJobRun)
      .where(eq(infraJobRun.claveIdempotente, claveIdempotente('2001-02-28', AHORA_E)))
    expect(corrida.estado).toBe('fallido')
  })

  it('con diez años completos guardados escribe umbrales con la versión IMERG', async () => {
    for (let anio = 2001; anio <= 2010; anio++) {
      await guardarAnioSerie(getDb(), {
        celdaEra5: claveSerieImerg(CELDA_A),
        anio,
        lat: -27.4,
        lon: -58.8,
        valores: new Array(diasDelAnio(anio)).fill(1),
        descargadoEn: AHORA_F.toISOString(),
      })
    }
    const { fetchImpl, urls } = crearFetchFalso()

    const resultado = await ejecutarCalculoClimatologiaImerg({
      ahora: AHORA_F,
      earthdataToken: TOKEN,
      fetchImpl,
      periodoDesde: '2001-01-01',
      periodoHasta: '2010-12-31',
    })

    expect(resultado).toMatchObject({
      ok: true,
      resultado: { diasDescargados: 0, diasPendientes: 0, celdasConUmbral: 1 },
    })
    expect(urls).toHaveLength(0)

    const filas = await getDb().select().from(hazardClimatology).where(eq(hazardClimatology.geometryRef, CELDA_A))
    expect(filas.length).toBeGreaterThan(0)
    expect(filas.every((fila) => fila.version === `${VERSION_CLIMATOLOGIA_IMERG}-2001-2010`)).toBe(true)
  })

  // Regresión (auditoría 2026-10-18): el período crece a medida que se bajan
  // años (2001-2010, luego 2001-2014...) y con una sola versión el reductor del
  // motor (agrupa por versión) mezclaba percentiles de períodos distintos.
  it('al crecer el período escribe otra versión y el motor no mezcla percentiles de períodos distintos', async () => {
    // beforeEach vacía la serie: se vuelve a guardar 2001-2010 (lluvia 1) más
    // 2011-2014 (lluvia 5); las filas 2001-2010 del test anterior siguen en la tabla.
    for (let anio = 2001; anio <= 2014; anio++) {
      await guardarAnioSerie(getDb(), {
        celdaEra5: claveSerieImerg(CELDA_A),
        anio,
        lat: -27.4,
        lon: -58.8,
        valores: new Array(diasDelAnio(anio)).fill(anio <= 2010 ? 1 : 5),
        descargadoEn: AHORA_H.toISOString(),
      })
    }
    const { fetchImpl } = crearFetchFalso()

    // Sin presupuesto de descarga: sólo recalcula umbrales con la serie guardada.
    await ejecutarCalculoClimatologiaImerg({
      ahora: AHORA_H,
      diasPorCorrida: 0,
      earthdataToken: TOKEN,
      fetchImpl,
      periodoDesde: '2001-01-01',
      periodoHasta: '2014-12-31',
    })

    const filas = await getDb().select().from(hazardClimatology).where(eq(hazardClimatology.geometryRef, CELDA_A))
    const versiones = new Set(filas.map((fila) => `${fila.version}|${fila.periodoDesde}|${fila.periodoHasta}`))
    expect(versiones).toEqual(
      new Set([
        `${VERSION_CLIMATOLOGIA_IMERG}-2001-2010|2001-01-01|2010-12-31`,
        `${VERSION_CLIMATOLOGIA_IMERG}-2001-2014|2001-01-01|2014-12-31`,
      ]),
    )

    const { reducirClimatologiaObservada } = await import('../motor/adaptadores/lluvia')
    const elegida = reducirClimatologiaObservada(filas).get(CELDA_A)?.[24]
    expect(elegida).toEqual({ p90: 5, p95: 5, p99: 5, version: `${VERSION_CLIMATOLOGIA_IMERG}-2001-2014` })
  })
})
