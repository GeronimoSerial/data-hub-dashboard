import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/acl'
import { getDb } from '@/lib/db'
import { hazardClimatology, hazardForecast } from '@/lib/db/schema'
import type { AccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'

// Factory puro (sin importOriginal) para no arrastrar @/lib/session -> @/lib/db
// antes de que el beforeAll fije DATA_DIR.
vi.mock('@/lib/infraestructura/acceso-lectura', () => ({
  verificarAccesoLectura: vi.fn(),
}))

const USER: SessionUser = { id: 'u1', role: 'consulta', banned: false, nivelIds: [] }

function mockAcceso(acceso: AccesoLectura) {
  vi.mocked(verificarAccesoLectura).mockResolvedValue(acceso)
}

const CELDA = '-31.7_-60.5'
const OTRA_CELDA = '-32.0_-61.0'

let dir: string
let prevDataDir: string | undefined

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'peligro-route-'))
  prevDataDir = process.env.DATA_DIR
  process.env.DATA_DIR = dir

  const { ensureSeeded } = await import('@/lib/db/seed')
  await ensureSeeded()

  await getDb()
    .insert(hazardForecast)
    .values([
      {
        id: 'f1',
        provider: 'open-meteo',
        variable: 'precipitacion',
        geometryRef: CELDA,
        corridaEn: '2026-01-01T00:00:00Z',
        validoEn: '2026-01-01T06:00:00Z',
        horizonteHoras: 6,
        valor: 12.5,
        unidad: 'mm',
        pasoHoras: 6,
        rawRef: null,
        ingeridoEn: '2026-01-01T00:10:00Z',
      },
      {
        id: 'f2',
        provider: 'open-meteo',
        variable: 'precipitacion',
        geometryRef: CELDA,
        corridaEn: '2026-01-01T00:00:00Z',
        validoEn: '2026-01-01T12:00:00Z',
        horizonteHoras: 12,
        valor: 3.1,
        unidad: 'mm',
        pasoHoras: 6,
        rawRef: null,
        ingeridoEn: '2026-01-01T00:10:00Z',
      },
      {
        id: 'f3',
        provider: 'inameh',
        variable: 'precipitacion',
        geometryRef: OTRA_CELDA,
        corridaEn: '2026-01-01T00:00:00Z',
        validoEn: '2026-01-01T06:00:00Z',
        horizonteHoras: 6,
        valor: 9.9,
        unidad: 'mm',
        pasoHoras: 6,
        rawRef: null,
        ingeridoEn: '2026-01-01T00:10:00Z',
      },
    ])

  await getDb()
    .insert(hazardClimatology)
    .values([
      {
        id: 'c1',
        geometryRef: CELDA,
        variable: 'precipitacion',
        percentil: 'p95',
        muestra: 'dias_humedos',
        valor: 40,
        unidad: 'mm',
        periodoDesde: '1991-01-01',
        periodoHasta: '2020-12-31',
        version: 'v1',
        calculadoEn: '2026-01-01T00:00:00Z',
      },
      {
        id: 'c2',
        geometryRef: OTRA_CELDA,
        variable: 'precipitacion',
        percentil: 'p95',
        muestra: 'dias_humedos',
        valor: 30,
        unidad: 'mm',
        periodoDesde: '1991-01-01',
        periodoHasta: '2020-12-31',
        version: 'v1',
        calculadoEn: '2026-01-01T00:00:00Z',
      },
    ])
})

afterAll(() => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  rmSync(dir, { recursive: true, force: true })
})

beforeEach(() => {
  vi.mocked(verificarAccesoLectura).mockReset()
})

function req(qs = '') {
  return new Request(`http://localhost/api/infraestructura/peligro${qs}`)
}

describe('GET /api/infraestructura/peligro', () => {
  it('rechaza sin sesión con 401', async () => {
    mockAcceso({ ok: false, status: 401 })
    const { GET } = await import('./route')
    const res = await GET(req())
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.pronostico).toBeUndefined()
  })

  it('rechaza con sesión pero sin acceso al recurso con 403', async () => {
    mockAcceso({ ok: false, status: 403 })
    const { GET } = await import('./route')
    const res = await GET(req())
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.pronostico).toBeUndefined()
  })

  it('sin geometryRef devuelve todas las celdas con pronostico ordenado por validoEn', async () => {
    mockAcceso({ ok: true, user: USER })
    const { GET } = await import('./route')
    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')

    const body = await res.json()
    expect(body.pronostico).toHaveLength(3)
    expect(body.climatologia).toHaveLength(2)

    const validos = body.pronostico.map((p: { validoEn: string }) => p.validoEn)
    expect(validos).toEqual([...validos].sort())

    const fila = body.pronostico.find((p: { validoEn: string }) => p.validoEn === '2026-01-01T06:00:00Z')
    expect(fila.geometryRef).toBeTypeOf('string')
    expect(fila.provider).toBeTypeOf('string')
    expect(fila.valor).toBeTypeOf('number')
    expect(fila.pasoHoras).toBeTypeOf('number')
    // La forma pública no expone columnas internas como rawRef/ingeridoEn.
    expect(fila.rawRef).toBeUndefined()
  })

  it('filtra pronostico y climatologia por geometryRef', async () => {
    mockAcceso({ ok: true, user: USER })
    const { GET } = await import('./route')
    const res = await GET(req(`?geometryRef=${encodeURIComponent(CELDA)}`))
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.pronostico).toHaveLength(2)
    expect(body.climatologia).toHaveLength(1)
    expect(
      body.pronostico.every((p: { geometryRef: string }) => p.geometryRef === CELDA),
    ).toBe(true)
  })

  it('rechaza geometryRef inválido con 400', async () => {
    mockAcceso({ ok: true, user: USER })
    const { GET } = await import('./route')
    const res = await GET(req('?geometryRef='))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('geometryRef inválido')
    expect(body.pronostico).toBeUndefined()
  })
})
