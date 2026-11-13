import { readFileSync } from 'node:fs'
import { eq, like } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb } from '@/lib/db'
import { hazardSourceHealth, infraJobRun, smnAlerta } from '@/lib/db/schema'
import {
  HttpInmetError,
  RespuestaInmetInvalidaError,
  parsearAvisosInmet,
  severidadInmetACap,
  syncInmetAlertas,
} from './inmet-alertas'

const RUTA_FIXTURE = 'lib/infraestructura/radar-meteo/__fixtures__/inmet/avisos-ativos-2026-11-13.json'
const ID_HOY = 'inmet:urn:oid:2.49.0.0.76.0.2026.28690.1'
const ID_FUTURO = 'inmet:urn:oid:2.49.0.0.76.0.2026.28691.1'
const UNIDADES = [
  { id: '1302603', nombre: 'Manaus' },
  { id: '1301100', nombre: 'Careiro' },
]

type Feed = { hoje: Array<Record<string, unknown>>; futuro: Array<Record<string, unknown>> }

const fixture = (): Feed => JSON.parse(readFileSync(RUTA_FIXTURE, 'utf8')) as Feed

// Aviso del día con Manaus (1302603) añadido a sus geocódigos.
function feedConManaus(): Feed {
  const feed = fixture()
  feed.hoje[0].geocodes = `${feed.hoje[0].geocodes},1302603`
  return feed
}

function respuestaJson(cuerpo: unknown, status = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

usarDbTemporal('inmet-alertas-')

describe('parsearAvisosInmet', () => {
  it('une hoy y futuro con id prefijado, horario de Brasilia convertido a UTC y raw sin icone', () => {
    const avisos = parsearAvisosInmet(fixture())
    expect(avisos).toHaveLength(2)
    expect(avisos[0]).toMatchObject({
      id: ID_HOY,
      idAviso: 28690,
      sender: 'INMET',
      sent: '2026-11-12T00:00:00.000Z',
      onset: '2026-11-13T03:00:00.000Z',
      expires: '2026-11-14T02:59:00.000Z',
      event: 'Tempestade',
      severity: 'Moderate',
      headline: 'Tempestade — Perigo Potencial (aviso não oficial, fonte INMET)',
      encerrado: false,
    })
    expect(avisos[1]).toMatchObject({
      id: ID_FUTURO,
      idAviso: 28691,
      onset: '2026-11-14T03:00:00.000Z',
      expires: '2026-11-15T02:59:00.000Z',
    })
    expect(avisos[0].geocodes[0]).toBe('5200050')
    expect(avisos[0].geocodes.at(-1)).toBe('1304260')
    expect(avisos[0].raw.length).toBeLessThanOrEqual(50_000)
    expect(JSON.parse(avisos[0].raw)).not.toHaveProperty('icone')
    expect(JSON.parse(avisos[0].raw).id_aviso).toBe(28690)
  })

  it('convierte el poligono GeoJSON en anillos [lon, lat] con el mismo formato que parsearCAP', () => {
    const [aviso] = parsearAvisosInmet(fixture())
    expect(aviso.poligonos).toEqual([
      [
        [-65.566406, 0.692122],
        [-65.566406, 0.922812],
        [-65.687256, 0.955766],
        [-65.906982, 0.812961],
        [-66.071777, 0.736064],
        [-66.258545, 0.714093],
        [-65.566406, 0.692122],
      ],
    ])
  })

  it('une riscos e instrucoes en texto plano con saltos de linea', () => {
    const [aviso] = parsearAvisosInmet(fixture())
    expect(aviso.description).toBe(
      'Chuva entre 20 e 30 mm/h ou até 50 mm/dia, ventos intensos (40-60 km/h), e queda de granizo. Baixo risco de corte de energia elétrica, estragos em plantações, queda de galhos de árvores e de alagamentos.',
    )
    expect(aviso.instruction).toContain('Evite usar aparelhos eletrônicos ligados à tomada.')
    expect(aviso.instruction?.split('\n')).toHaveLength(3)
  })

  it('interpreta riscos con forma de lista Python, incluidas comillas dobles por apostrofes', () => {
    const feed = fixture()
    feed.hoje[0].riscos = "['Vento forte', \"d'água alta\"]"
    expect(parsearAvisosInmet(feed)[0].description).toBe("Vento forte\nd'água alta")
  })

  it('conserva el texto tal cual cuando riscos no tiene forma de lista', () => {
    const feed = fixture()
    feed.hoje[0].riscos = 'Sin lista'
    expect(parsearAvisosInmet(feed)[0].description).toBe('Sin lista')
  })

  it.each([
    ['cuerpo nulo', null],
    ['falta futuro', { hoje: [] }],
    ['hoje no es lista', { hoje: 'x', futuro: [] }],
    ['aviso sin codigo', { hoje: [{ ...fixture().hoje[0], codigo: undefined }], futuro: [] }],
    ['inicio con formato distinto', { hoje: [{ ...fixture().hoje[0], inicio: '2026/11/13 00:00' }], futuro: [] }],
  ])('rechaza forma inválida: %s', (_caso, cuerpo) => {
    expect(() => parsearAvisosInmet(cuerpo)).toThrow(RespuestaInmetInvalidaError)
  })
})

describe('severidadInmetACap', () => {
  it('mapea las severidades de INMET a CAP y usa Moderate para una desconocida', () => {
    expect(severidadInmetACap('Perigo Potencial')).toBe('Moderate')
    expect(severidadInmetACap('Perigo')).toBe('Severe')
    expect(severidadInmetACap('Grande Perigo')).toBe('Extreme')
    expect(severidadInmetACap('Otra cosa')).toBe('Moderate')
  })
})

describe('syncInmetAlertas', () => {
  const db = getDb()

  beforeEach(async () => {
    await db.delete(smnAlerta).where(like(smnAlerta.id, 'inmet:%'))
  })

  it('no guarda avisos que no tocan las unidades de la región', async () => {
    const fetchImpl = vi.fn(async () => respuestaJson(fixture()))
    const resultado = await syncInmetAlertas({
      ahora: new Date('2026-11-13T11:00:00Z'),
      fetchImpl,
      unidades: () => [{ id: '1302603', nombre: 'Manaus' }],
    })
    expect(resultado).toEqual({ ejecutado: true, estado: 'completo', procesadas: 2, guardadas: 0, canceladas: 0 })
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://apiprevmet3.inmet.gov.br/avisos/ativos',
      expect.objectContaining({ headers: expect.objectContaining({ 'User-Agent': 'ENOS-alertas/1.0' }) }),
    )
    expect((await db.select().from(smnAlerta)).filter((fila) => fila.id.startsWith('inmet:'))).toHaveLength(0)
  })

  it('guarda el aviso de Manaus con la forma de smn_alerta y departamentos de la región', async () => {
    const fetchImpl = vi.fn(async () => respuestaJson(feedConManaus()))
    const resultado = await syncInmetAlertas({
      ahora: new Date('2026-11-13T12:00:00Z'),
      fetchImpl,
      unidades: () => [{ id: '1302603', nombre: 'Manaus' }],
    })
    expect(resultado).toMatchObject({ procesadas: 2, guardadas: 1, canceladas: 0 })
    const [fila] = await db.select().from(smnAlerta).where(eq(smnAlerta.id, ID_HOY))
    expect(fila).toMatchObject({
      id: ID_HOY,
      sender: 'INMET',
      sent: '2026-11-12T00:00:00.000Z',
      onset: '2026-11-13T03:00:00.000Z',
      expires: '2026-11-14T02:59:00.000Z',
      event: 'Tempestade',
      severity: 'Moderate',
      urgency: null,
      certainty: null,
      headline: 'Tempestade — Perigo Potencial (aviso não oficial, fonte INMET)',
      nivelSat: null,
      departamentos: [{ id: '1302603', nombre: 'Manaus' }],
      fetchedAt: '2026-11-13T12:00:00.000Z',
      cancelada: false,
    })
    expect(fila.poligonos).toHaveLength(1)
    expect(fila.description).toContain('Chuva entre 20 e 30 mm/h')
  })

  it('reejecutar con el mismo feed actualiza la misma fila sin duplicarla', async () => {
    const fetchImpl = vi.fn(async () => respuestaJson(feedConManaus()))
    await syncInmetAlertas({ ahora: new Date('2026-11-13T12:15:00Z'), fetchImpl, unidades: () => UNIDADES })
    await syncInmetAlertas({ ahora: new Date('2026-11-13T12:30:00Z'), fetchImpl, unidades: () => UNIDADES })
    const filas = (await db.select().from(smnAlerta)).filter((fila) => fila.id.startsWith('inmet:'))
    expect(filas.map((fila) => fila.id)).toEqual([ID_HOY])
    expect(filas[0].fetchedAt).toBe('2026-11-13T12:30:00.000Z')
  })

  it('un aviso que desaparece del feed se marca cancelado y se cuenta', async () => {
    await syncInmetAlertas({
      ahora: new Date('2026-11-13T13:00:00Z'),
      fetchImpl: vi.fn(async () => respuestaJson(feedConManaus())),
      unidades: () => UNIDADES,
    })
    const sinHoy = { hoje: [], futuro: fixture().futuro }
    const resultado = await syncInmetAlertas({
      ahora: new Date('2026-11-13T13:15:00Z'),
      fetchImpl: vi.fn(async () => respuestaJson(sinHoy)),
      unidades: () => UNIDADES,
    })
    expect(resultado).toMatchObject({ guardadas: 0, canceladas: 1 })
    const [fila] = await db.select().from(smnAlerta).where(eq(smnAlerta.id, ID_HOY))
    expect(fila.cancelada).toBe(true)
  })

  it('un aviso relevante con encerrado true se guarda cancelado', async () => {
    const feed = feedConManaus()
    feed.hoje[0].encerrado = true
    const resultado = await syncInmetAlertas({
      ahora: new Date('2026-11-13T13:30:00Z'),
      fetchImpl: vi.fn(async () => respuestaJson(feed)),
      unidades: () => UNIDADES,
    })
    expect(resultado).toMatchObject({ guardadas: 1 })
    const [fila] = await db.select().from(smnAlerta).where(eq(smnAlerta.id, ID_HOY))
    expect(fila.cancelada).toBe(true)
  })

  it('el barrido y la purga no tocan filas SMN', async () => {
    await db.insert(smnAlerta).values([
      {
        id: 'urn:smn:conservada',
        sender: 'smn',
        sent: '2026-11-13T00:00:00Z',
        onset: '2026-11-13T00:00:00Z',
        expires: '2026-11-20T00:00:00Z',
        event: 'Tormentas',
        severity: 'Moderate',
        departamentos: [],
        poligonos: [],
        raw: 'fixture',
        fetchedAt: '2026-11-13T00:00:00Z',
        cancelada: false,
      },
      {
        id: 'inmet:antigua',
        sender: 'INMET',
        sent: '2026-01-01T00:00:00Z',
        onset: '2026-01-01T00:00:00Z',
        expires: '2026-01-02T00:00:00Z',
        event: 'Tempestade',
        severity: 'Moderate',
        departamentos: [],
        poligonos: [],
        raw: '{}',
        fetchedAt: '2026-01-01T00:00:00Z',
        cancelada: false,
      },
    ])
    await syncInmetAlertas({
      ahora: new Date('2026-11-13T14:00:00Z'),
      fetchImpl: vi.fn(async () => respuestaJson(fixture())),
      unidades: () => UNIDADES,
    })
    const [smn] = await db.select().from(smnAlerta).where(eq(smnAlerta.id, 'urn:smn:conservada'))
    expect(smn.cancelada).toBe(false)
    const antigua = await db.select().from(smnAlerta).where(eq(smnAlerta.id, 'inmet:antigua'))
    expect(antigua).toHaveLength(0)
    await db.delete(smnAlerta).where(eq(smnAlerta.id, 'urn:smn:conservada'))
  })

  it('HTTP 500 reintenta, lanza, registra run fallido con mensaje fijo y salud no_disponible', async () => {
    const fetchImpl = vi.fn(async () => new Response('<html>boom token=SECRETO-9</html>', { status: 500 }))
    await expect(
      syncInmetAlertas({ ahora: new Date('2026-11-13T15:00:00Z'), fetchImpl, unidades: () => UNIDADES }),
    ).rejects.toThrow(HttpInmetError)
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    const [run] = (await db.select().from(infraJobRun)).filter(
      (fila) => fila.tipo === 'sync-inmet-alertas' && fila.claveIdempotente === '2026-11-13T15:00',
    )
    expect(run.estado).toBe('fallido')
    expect(run.errorSaneado).toBe('HTTP 500')
    const [salud] = await db.select().from(hazardSourceHealth).where(eq(hazardSourceHealth.provider, 'inmet-alertas'))
    expect(salud.estado).toBe('no_disponible')
    expect(salud.ultimoErrorSaneado).toBe('fallo al sincronizar alertas del INMET')
    expect(salud.ultimoErrorSaneado).not.toContain('SECRETO')
  })

  it('HTTP 429 no reintenta y registra salud degradado sin filtrar el cuerpo', async () => {
    const fetchImpl = vi.fn(async () => new Response('rate limit apikey=SECRETO-123', { status: 429 }))
    await expect(
      syncInmetAlertas({ ahora: new Date('2026-11-13T15:15:00Z'), fetchImpl, unidades: () => UNIDADES }),
    ).rejects.toThrow('HTTP 429')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [salud] = await db.select().from(hazardSourceHealth).where(eq(hazardSourceHealth.provider, 'inmet-alertas'))
    expect(salud.estado).toBe('degradado')
    expect(salud.ultimoErrorSaneado).toBe('INMET limitó las consultas (HTTP 429)')
    expect(salud.ultimoErrorSaneado).not.toContain('SECRETO')
  })

  it('JSON mal formado falla antes de escribir: no barre ni inserta filas', async () => {
    await db.insert(smnAlerta).values({
      id: ID_HOY,
      sender: 'INMET',
      sent: '2026-11-12T00:00:00.000Z',
      onset: '2026-11-13T03:00:00.000Z',
      expires: '2026-11-14T02:59:00.000Z',
      event: 'Tempestade',
      severity: 'Moderate',
      departamentos: [{ id: '1302603', nombre: 'Manaus' }],
      poligonos: [],
      raw: '{}',
      fetchedAt: '2026-11-13T12:00:00.000Z',
      cancelada: false,
    })
    const fetchImpl = vi.fn(async () => new Response('{"hoje": [', { status: 200 }))
    await expect(
      syncInmetAlertas({ ahora: new Date('2026-11-13T15:30:00Z'), fetchImpl, unidades: () => UNIDADES }),
    ).rejects.toThrow(RespuestaInmetInvalidaError)
    const [previa] = await db.select().from(smnAlerta).where(eq(smnAlerta.id, ID_HOY))
    expect(previa.cancelada).toBe(false)
    const [salud] = await db.select().from(hazardSourceHealth).where(eq(hazardSourceHealth.provider, 'inmet-alertas'))
    expect(salud.estado).toBe('no_disponible')
  })

  it('una segunda sincronización en el mismo cuarto de hora queda omitida', async () => {
    const ahora = new Date('2026-11-13T16:00:00Z')
    const primera = vi.fn(async () => respuestaJson(fixture()))
    expect(await syncInmetAlertas({ ahora, fetchImpl: primera, unidades: () => UNIDADES })).toMatchObject({
      ejecutado: true,
      estado: 'completo',
    })
    const segunda = vi.fn(async () => respuestaJson(fixture()))
    expect(await syncInmetAlertas({ ahora, fetchImpl: segunda, unidades: () => UNIDADES })).toEqual({
      ejecutado: false,
      estado: 'omitido',
    })
    expect(segunda).not.toHaveBeenCalled()
  })
})
