import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb } from '@/lib/db'
import { hazardObservation, hazardSourceHealth, infraJobRun } from '@/lib/db/schema'
import { celdaDeCoordenada } from '../celda'
import { mapearAsciiImergACeldas, parsearRespuestaAsciiImerg } from '../providers/imerg'
import type { ejecutarSyncImerg as EjecutarSyncImerg } from './sync-imerg'
import type { PuertoObservacionSatelital } from '../adaptadores-ingesta/puertos'
import { cmrConEntradas } from '../adaptadores-ingesta/__fixtures__/contrato'

usarDbTemporal('sync-imerg-')

beforeAll(async () => {
  ;({ ejecutarSyncImerg } = await import('./sync-imerg'))
})

let ejecutarSyncImerg: typeof EjecutarSyncImerg

// --- Fixtures reales (sin red) -------------------------------------------------

const fixtureAscii = readFileSync(
  new URL('../__fixtures__/hazard/imerg-subset-2026-09-26.ascii', import.meta.url),
  'utf8',
)

const GRANULO_INICIO = '2026-09-26T18:30:00.000Z'
const GRANULO_FIN = '2026-09-26T18:59:59.999Z'

// Recuento esperado del mapeo puro: el fixture real tiene 42 filas (lon) x 37
// valores (lat). Con la grilla IMERG desfasada 0,05° y `celdaDeCoordenada`
// redondeando a 0,1°, cada par (lat, lon) cae en una celda distinta: este
// fixture NO tiene colisiones, así que el set de `geometryRef` distintos
// coincide con la grilla cruda. El dedup se verifica como igualdad contra ese
// set, no contra un número menor.
const PUNTOS_MAPEADOS = mapearAsciiImergACeldas({
  parseado: parsearRespuestaAsciiImerg(fixtureAscii),
  observadoEn: GRANULO_INICIO,
  validoDesde: GRANULO_INICIO,
  validoHasta: GRANULO_FIN,
  celdaDeCoordenada,
})
const CELDAS_ESPERADAS = new Set(PUNTOS_MAPEADOS.map((punto) => punto.geometryRef)).size

type FetchImpl = typeof fetch

// Construye un payload CMR sintético con títulos y URLs distintos por timestamp.
const CMR_REAL = cmrConEntradas([{ inicioEn: GRANULO_INICIO, finEn: GRANULO_FIN }])

// Mock de `fetchImpl`: responde el payload de CMR sintético a cualquier
// búsqueda de gránulos, y el fixture ASCII real a cualquier subset OPeNDAP
// (el contenido no depende del gránulo pedido en estos tests: lo que importa
// es que cada URL de subset distinta se registre como una llamada aparte).
function fetchConFixtures(
  cmrPayload: unknown = CMR_REAL,
  urlsQueFallan: Set<string> = new Set(),
  subsetQueFalla?: (url: string) => boolean,
) {
  return vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input)
    if (url.includes('/search/granules.json')) {
      return new Response(JSON.stringify(cmrPayload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    if (url.includes('gesdisc.eosdis.nasa.gov/opendap/')) {
      if (urlsQueFallan.has(url) || subsetQueFalla?.(url)) {
        return new Response('boom', { status: 500 })
      }
      return new Response(fixtureAscii, { status: 200, headers: { 'content-type': 'text/plain' } })
    }
    throw new Error(`URL inesperada en el test: ${url}`)
  })
}

function sync(over: Parameters<typeof ejecutarSyncImerg>[0] = {}) {
  return ejecutarSyncImerg({
    earthdataToken: 'token-fake',
    fetchImpl: fetchConFixtures() as unknown as FetchImpl,
    ...over,
  })
}

function db() {
  return getDb()
}

async function contarObservaciones(): Promise<number> {
  const filas = await (await db()).select().from(hazardObservation)
  return filas.filter((fila) => fila.provider === 'nasa-imerg').length
}

async function saludImerg() {
  const filas = await (await db()).select().from(hazardSourceHealth)
  return filas.find((fila) => fila.provider === 'nasa-imerg')
}

describe('ejecutarSyncImerg', () => {
  it.each([
    ['sin token no llama a la red y deja la salud en no_disponible', undefined, '2026-09-26T00:15:00.000Z', 'no debe llamarse a la red sin token'],
    ['con token vacío tampoco llama a la red', '', '2026-09-26T00:45:00.000Z', 'no debe llamarse a la red con token vacío'],
  ])('%s', async (_titulo, earthdataToken, ahoraIso, mensajeSinRed) => {
    const fetchImpl = vi.fn(async () => {
      throw new Error(mensajeSinRed)
    })
    const ahora = new Date(ahoraIso)

    const resultado = await sync({
      ahora,
      fetchImpl: fetchImpl as unknown as FetchImpl,
      earthdataToken,
    })

    expect(resultado).toEqual({
      ok: true,
      resultado: {
        celdasActualizadas: 0,
        motivo: 'fuente_no_configurada',
        granulosProcesados: 0,
        granulosFallidos: 0,
      },
    })
    expect(fetchImpl).not.toHaveBeenCalled()

    const salud = await saludImerg()
    expect(salud?.estado).toBe('no_disponible')
    expect(salud?.ultimoErrorSaneado).toBe('fuente no configurada: falta EARTHDATA_TOKEN')
    expect(salud?.ultimoIntentoEn).toBe(ahora.toISOString())
    expect(salud?.ttlMinutos).toBe(60)
  })

  it('con token busca gránulos en la ventana de backfill, subsetea el faltante, deduplica y persiste', async () => {
    const fetchImpl = fetchConFixtures()
    const ahora = new Date('2026-09-26T19:05:00.000Z') // bloque 19:00, gránulo real 18:30 aún no ingerido
    const antes = await contarObservaciones()

    const resultado = await sync({
      ahora,
      fetchImpl: fetchImpl as unknown as FetchImpl,
    })

    expect(resultado).toEqual({
      ok: true,
      resultado: {
        celdasActualizadas: CELDAS_ESPERADAS,
        motivo: 'sincronizado',
        granulosProcesados: 1,
        granulosFallidos: 0,
      },
    })
    // Una llamada a CMR (listado por ventana) + una al subset OPeNDAP del
    // único gránulo faltante.
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    const urlCmr = String(fetchImpl.mock.calls[0]?.[0])
    expect(urlCmr).toContain('temporal=')
    expect(urlCmr).not.toContain('page_size=1&')
    // El header de autorización viaja en ambas.
    const primeraInit = fetchImpl.mock.calls[0]?.[1] as RequestInit | undefined
    expect((primeraInit?.headers as Record<string, string> | undefined)?.Authorization).toBe(
      'Bearer token-fake',
    )

    const filas = (await (await db()).select().from(hazardObservation)).filter(
      (fila) => fila.provider === 'nasa-imerg',
    )
    expect(filas.length - antes).toBe(CELDAS_ESPERADAS)
    expect(PUNTOS_MAPEADOS).toHaveLength(37 * 42)
    expect(CELDAS_ESPERADAS).toBeLessThanOrEqual(37 * 42)
    // Cada geometryRef aparece una sola vez.
    expect(new Set(filas.map((fila) => fila.geometryRef)).size).toBe(filas.length)

    const muestra = filas[0]
    expect(muestra?.variable).toBe('precipitacion_observada_satelital')
    expect(muestra?.unidad).toBe('mm/30min')
    expect(muestra?.observadoEn).toBe(GRANULO_INICIO)
    expect(muestra?.validoDesde).toBe(GRANULO_INICIO)
    expect(muestra?.validoHasta).toBe(GRANULO_FIN)
    expect(muestra?.rawRef).toBeNull()

    const salud = await saludImerg()
    expect(salud?.estado).toBe('ok')
    expect(salud?.ultimoExitoEn).toBe(ahora.toISOString())
    expect(salud?.ultimoErrorSaneado).toBeNull()
  })

  it('CMR sin gránulo no crashea: degradado, contador 0 y lease liberado', async () => {
    const fetchImpl = fetchConFixtures({ feed: { entry: [] } })
    const ahora = new Date('2026-09-26T02:05:00.000Z') // bloque 02:00

    const resultado = await sync({
      ahora,
      fetchImpl: fetchImpl as unknown as FetchImpl,
    })

    expect(resultado).toEqual({
      ok: true,
      resultado: {
        celdasActualizadas: 0,
        motivo: 'sin_granulo_disponible',
        granulosProcesados: 0,
        granulosFallidos: 0,
      },
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)

    const salud = await saludImerg()
    expect(salud?.estado).toBe('degradado')

    const run = (await (await db()).select().from(infraJobRun)).find(
      (fila) => fila.tipo === 'sync-hazard-imerg' && fila.claveIdempotente === '2026-09-26T02:00',
    )
    expect(run?.estado).toBe('completado')
    expect(run?.contadores).toEqual({ celdasActualizadas: 0 })
    expect(run?.leaseOwner).toBeNull()
  })

  it('falla el subsetting del gránulo más reciente (HTTP 500): degradado, no crashea y libera el lease', async () => {
    const inicio = '2026-09-26T03:00:00.000Z'
    const fin = '2026-09-26T03:29:59.999Z'
    const cmr = cmrConEntradas([{ inicioEn: inicio, finEn: fin }])
    const fetchImpl = fetchConFixtures(cmr, new Set(), () => true)
    const ahora = new Date('2026-09-26T03:35:00.000Z') // bloque 03:30
    const antes = await contarObservaciones()

    const resultado = await sync({
      ahora,
      fetchImpl: fetchImpl as unknown as FetchImpl,
    })

    expect(resultado).toEqual({
      ok: true,
      resultado: {
        celdasActualizadas: 0,
        motivo: 'sin_granulo_disponible',
        granulosProcesados: 0,
        granulosFallidos: 1,
      },
    })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(await contarObservaciones()).toBe(antes)

    const salud = await saludImerg()
    expect(salud?.estado).toBe('degradado')

    const run = (await (await db()).select().from(infraJobRun)).find(
      (fila) => fila.tipo === 'sync-hazard-imerg' && fila.claveIdempotente === '2026-09-26T03:30',
    )
    expect(run?.estado).toBe('completado')
    expect(run?.contadores).toEqual({ celdasActualizadas: 0, granulosProcesados: 0, granulosFallidos: 1 })
    expect(run?.leaseOwner).toBeNull()
  })

  it('segunda corrida en la misma ventana de 30 min no adquiere lease ni duplica', async () => {
    const inicio = '2026-09-26T04:00:00.000Z'
    const fin = '2026-09-26T04:29:59.999Z'
    const cmr = cmrConEntradas([{ inicioEn: inicio, finEn: fin }])
    const fetchImpl = fetchConFixtures(cmr)
    const primera = await sync({
      ahora: new Date('2026-09-26T04:05:00.000Z'), // bloque 04:00
      fetchImpl: fetchImpl as unknown as FetchImpl,
    })
    expect(primera.ok).toBe(true)
    const despuesPrimera = await contarObservaciones()

    const segunda = await sync({
      ahora: new Date('2026-09-26T04:20:00.000Z'), // MISMO bloque 04:00
      fetchImpl: fetchImpl as unknown as FetchImpl,
    })

    expect(segunda).toEqual({ ok: false, motivo: 'lease_no_disponible' })
    expect(await contarObservaciones()).toBe(despuesPrimera)
  })

  it('repetir el MISMO gránulo ya ingerido en otra ventana no vuelve a pedir el subset (upsert evitado por chequeo previo)', async () => {
    const fetchImpl = fetchConFixtures() // CMR_REAL = gránulo 18:30, ya ingerido en el 1er test
    const antes = await contarObservaciones()

    const resultado = await sync({
      ahora: new Date('2026-09-26T19:35:00.000Z'), // bloque 19:30, misma ventana con el mismo gránulo real
      fetchImpl: fetchImpl as unknown as FetchImpl,
    })

    expect(resultado).toEqual({
      ok: true,
      resultado: { celdasActualizadas: 0, motivo: 'sincronizado', granulosProcesados: 0, granulosFallidos: 0 },
    })
    // Sólo CMR: el chequeo de `observadoEn` ya existentes evita repetir el
    // subset de un gránulo que sabemos que ya está persistido.
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(await contarObservaciones()).toBe(antes)

    const filas = (await (await db()).select().from(hazardObservation)).filter(
      (fila) => fila.provider === 'nasa-imerg' && fila.observadoEn === GRANULO_INICIO,
    )
    expect(filas).toHaveLength(CELDAS_ESPERADAS)
  })

  it('backfill: completa varios gránulos faltantes de la ventana histórica en la misma corrida', async () => {
    const entradas = [
      { inicioEn: '2026-09-26T10:30:00.000Z', finEn: '2026-09-26T10:59:59.999Z' },
      { inicioEn: '2026-09-26T10:00:00.000Z', finEn: '2026-09-26T10:29:59.999Z' },
      { inicioEn: '2026-09-26T09:30:00.000Z', finEn: '2026-09-26T09:59:59.999Z' },
    ]
    const cmr = cmrConEntradas(entradas)
    const fetchImpl = fetchConFixtures(cmr)
    const antes = await contarObservaciones()

    const resultado = await sync({
      ahora: new Date('2026-09-26T11:05:00.000Z'), // bloque 11:00
      fetchImpl: fetchImpl as unknown as FetchImpl,
    })

    expect(resultado).toEqual({
      ok: true,
      resultado: {
        celdasActualizadas: CELDAS_ESPERADAS * 3,
        motivo: 'sincronizado',
        granulosProcesados: 3,
        granulosFallidos: 0,
      },
    })
    // 1 CMR + 3 subsets (uno por gránulo faltante).
    expect(fetchImpl).toHaveBeenCalledTimes(4)
    expect((await contarObservaciones()) - antes).toBe(CELDAS_ESPERADAS * 3)

    const observadosEn = new Set(
      (await (await db()).select().from(hazardObservation))
        .filter((fila) => fila.provider === 'nasa-imerg')
        .map((fila) => fila.observadoEn),
    )
    for (const entrada of entradas) expect(observadosEn.has(entrada.inicioEn)).toBe(true)
  })

  it('backfill: un gránulo que falla se cuenta como fallido y no aborta los demás', async () => {
    const entradas = [
      { inicioEn: '2026-09-26T13:30:00.000Z', finEn: '2026-09-26T13:59:59.999Z' },
      { inicioEn: '2026-09-26T13:00:00.000Z', finEn: '2026-09-26T13:29:59.999Z' },
      { inicioEn: '2026-09-26T12:30:00.000Z', finEn: '2026-09-26T12:59:59.999Z' },
    ]
    const cmr = cmrConEntradas(entradas)
    // El del medio (13:00) falla; el más reciente (13:30) y el más viejo
    // (12:30) se procesan igual. Buscamos por substring del sello (mismo
    // esquema que cmrConEntradas) en la URL de subset generada.
    const selloFallido = '13:00:00.000Z'.replace(/[-:.]/g, '')
    const fetchImpl = fetchConFixtures(cmr, new Set(), (url) => url.includes(selloFallido))
    const antes = await contarObservaciones()

    const resultado = await sync({
      ahora: new Date('2026-09-26T14:05:00.000Z'), // bloque 14:00
      fetchImpl: fetchImpl as unknown as FetchImpl,
    })

    expect(resultado).toEqual({
      ok: true,
      resultado: {
        celdasActualizadas: CELDAS_ESPERADAS * 2,
        motivo: 'sincronizado', // el más reciente (13:30) sí se procesó
        granulosProcesados: 2,
        granulosFallidos: 1,
      },
    })
    expect((await contarObservaciones()) - antes).toBe(CELDAS_ESPERADAS * 2)

    const salud = await saludImerg()
    // El más reciente se procesó bien: la fuente se reporta 'ok'.
    expect(salud?.estado).toBe('ok')
  })

  it('backfill: acota el número de gránulos procesados por corrida al presupuesto documentado', async () => {
    const entradas = Array.from({ length: 20 }, (_, i) => {
      const minutos = i * 30
      const inicio = new Date(Date.UTC(2026, 8, 26, 16, 0, 0) - minutos * 60 * 1000)
      const fin = new Date(inicio.getTime() + 29 * 60 * 1000 + 59999)
      return { inicioEn: inicio.toISOString(), finEn: fin.toISOString() }
    })
    const cmr = cmrConEntradas(entradas)
    const fetchImpl = fetchConFixtures(cmr)

    const resultado = await sync({
      ahora: new Date('2026-09-26T16:05:00.000Z'), // bloque 16:00
      fetchImpl: fetchImpl as unknown as FetchImpl,
    })

    expect(resultado.ok).toBe(true)
    if (resultado.ok) {
      // El presupuesto documentado (MAX_GRANULOS_A_PROCESAR_POR_CORRIDA) es
      // menor a los 20 gránulos listados: el resto queda para la corrida
      // siguiente, sin disparar 20 requests de una sola vez.
      expect(resultado.resultado.granulosProcesados).toBeLessThan(20)
      expect(resultado.resultado.granulosProcesados).toBeGreaterThan(0)
      expect(resultado.resultado.motivo).toBe('sincronizado')
    }
    // 1 CMR + N subsets, N = granulosProcesados.
    if (resultado.ok) {
      expect(fetchImpl).toHaveBeenCalledTimes(1 + resultado.resultado.granulosProcesados)
    }
  })

  // Cableado por PUERTO (ABS1, segunda parte): a diferencia de los demás
  // tests (que inyectan `fetchImpl`/`earthdataToken` y dejan que el job
  // construya el adaptador real), acá se inyecta el PUERTO completo
  // (`PuertoObservacionSatelital`) directamente. Cero red, ni siquiera
  // `fetchImpl` fake: el fake vive enteramente por encima del fetch.
  it('con un puerto fake inyectado directamente (sin adaptador, sin red) persiste sus observaciones', async () => {
    const ahora = new Date('2026-09-26T22:05:00.000Z') // bloque 22:00, libre
    const antes = await contarObservaciones()
    const granulo = {
      id: 'GPM_3IMERGHHE.fake-puerto',
      inicioEn: '2026-09-26T21:30:00.000Z',
      finEn: '2026-09-26T21:59:59.999Z',
      urlDatos: 'https://example.invalid/fake-puerto.HDF5',
    }

    const puertoFake: PuertoObservacionSatelital = {
      async listarGranulos() {
        return [granulo]
      },
      async obtenerObservacion() {
        return {
          observaciones: [
            {
              geometryRef: '-27.5_-58.8',
              variable: 'precipitacion_observada_satelital' as const,
              valorMm: 1.1,
              observadoEn: granulo.inicioEn,
              ventanaDesde: granulo.inicioEn,
              ventanaHasta: granulo.finEn,
              calidad: 0.9,
            },
          ],
          celdasSinDato: [],
        }
      },
    }

    const resultado = await sync({ ahora, puerto: puertoFake })

    expect(resultado).toEqual({
      ok: true,
      resultado: {
        celdasActualizadas: 1,
        motivo: 'sincronizado',
        granulosProcesados: 1,
        granulosFallidos: 0,
      },
    })
    expect((await contarObservaciones()) - antes).toBe(1)

    const filas = (await (await db()).select().from(hazardObservation)).filter(
      (fila) => fila.provider === 'nasa-imerg' && fila.geometryRef === '-27.5_-58.8',
    )
    const fila = filas.find((f) => f.observadoEn === granulo.inicioEn)
    expect(fila?.valor).toBe(1.1)
    expect(fila?.unidad).toBe('mm/30min')
    expect(fila?.calidad).toBe(0.9)
  })
})
