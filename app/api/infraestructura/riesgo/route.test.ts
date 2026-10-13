import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Ruta from './route'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb } from '@/lib/db'
import {
  infraGeoProfile,
  infraRiskFactor,
  infraRiskRun,
  infraRiskSnapshot,
} from '@/lib/db/schema'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import {
  mockAcceso,
  PUBLICADO_EN,
  RUN_VIGENTE,
  sembrarMotorBase,
  USER,
} from '@/lib/infraestructura/riesgo/__fixtures__/motor-api'

// Factory puro (sin importOriginal) para no arrastrar @/lib/session -> @/lib/db
// antes de que el beforeAll fije DATA_DIR.
vi.mock('@/lib/infraestructura/acceso-lectura', () => ({
  verificarAccesoLectura: vi.fn(),
}))

const GEO = [
  { cueAnexo: '1000000-01', departamento: 'PARANA' },
  { cueAnexo: '1000000-02', departamento: 'PARANA' },
  { cueAnexo: '1000000-03', departamento: 'CONCORDIA' },
  { cueAnexo: '1000000-04', departamento: 'PARANA' },
  { cueAnexo: '1000000-05', departamento: 'PARANA' },
]

usarDbTemporal('riesgo-route-', { seed: false })

let GET: typeof Ruta.GET

beforeAll(async () => {
  const seed = await import('@/lib/db/seed')
  await seed.ensureSeeded()
  PERIODO = seed.PERIODO_ENOS_2026_2027_ID
  GET = (await import('./route')).GET
})

let PERIODO = ''

async function limpiarMotor() {
  const db = getDb()
  await db.delete(infraRiskFactor)
  await db.delete(infraRiskSnapshot)
  await db.delete(infraRiskRun)
  await db.delete(infraGeoProfile)
}

async function sembrarFixture() {
  const db = getDb()
  await limpiarMotor()

  await db.insert(infraGeoProfile).values(
    GEO.map((g) => ({
      cueAnexo: g.cueAnexo,
      lat: -31.7,
      lon: -60.5,
      geoCalidad: 'alta',
      departamento: g.departamento,
      geometryRef: '-31.7_-60.5',
      motivoExclusion: null,
      perfilVersion: 'v1',
      calculadoEn: '2026-01-01T00:00:00Z',
    })),
  )

  await sembrarMotorBase(PERIODO)
}

beforeEach(async () => {
  vi.mocked(verificarAccesoLectura).mockReset()
  await sembrarFixture()
})

function req(qs = '') {
  return new Request(`http://localhost/api/infraestructura/riesgo${qs}`)
}

describe('GET /api/infraestructura/riesgo', () => {
  it('rechaza sin sesión con 401', async () => {
    mockAcceso({ ok: false, status: 401 })
    const res = await GET(req())
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('No autenticado')
    expect(body.items).toBeUndefined()
  })

  it('rechaza con sesión pero sin acceso al recurso con 403', async () => {
    mockAcceso({ ok: false, status: 403 })
    const res = await GET(req())
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('No tiene acceso a este recurso')
  })

  it('rechaza 403 a un usuario sin acceso al recurso (p. ej. el director)', async () => {
    // El director queda excluido dentro de verificarAccesoLectura, que ya está
    // implementado; acá se simula su resultado (403) igual que en los otros tests.
    mockAcceso({ ok: false, status: 403 })
    const res = await GET(req())
    expect(res.status).toBe(403)
  })

  it('sin run vigente devuelve 200 con lista vacía (no es un error)', async () => {
    mockAcceso({ ok: true, user: USER })
    await limpiarMotor()
    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    const body = await res.json()
    expect(body.items).toEqual([])
    expect(body.total).toBe(0)
    expect(body.totalPages).toBe(0)
    expect(body.runVigente).toBeNull()
  })

  it('devuelve items ordenados por scoreRiesgo desc, con null (sin evidencia) al final', async () => {
    mockAcceso({ ok: true, user: USER })
    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')

    const body = await res.json()
    expect(body.total).toBe(5)
    expect(body.totalPages).toBe(1)
    expect(body.runVigente).toEqual({
      id: RUN_VIGENTE,
      modeloVersion: 'riesgo-v0',
      publicadoEn: PUBLICADO_EN,
    })

    expect(body.items.map((i: { snapshotId: string }) => i.snapshotId)).toEqual([
      's1',
      's5',
      's2',
      's4',
      's3',
    ])
    const scores = body.items.map((i: { scoreRiesgo: number | null }) => i.scoreRiesgo)
    expect(scores).toEqual([80, 60, 50, 30, null])
    expect(body.items.at(-1).evidenciaValida).toBe(false)
    // El snapshot del run vencido no aparece.
    expect(body.items.some((i: { snapshotId: string }) => i.snapshotId === 's6')).toBe(false)
  })

  it('expone la amenaza (score y nivel) por separado de la prioridad', async () => {
    mockAcceso({ ok: true, user: USER })
    const body = await (await GET(req())).json()
    const porId = new Map(
      body.items.map((i: { snapshotId: string }) => [i.snapshotId, i]),
    )
    expect(porId.get('s1')).toMatchObject({ nivelRiesgo: 'muy_alto', scoreAmenaza: 70, nivelAmenaza: 'alto' })
    expect(porId.get('s3')).toMatchObject({ scoreAmenaza: null, nivelAmenaza: null })
  })

  it('filtra por horizonte', async () => {
    mockAcceso({ ok: true, user: USER })
    const res = await GET(req('?horizonte=24'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.total).toBe(4)
    expect(
      body.items.every((i: { horizonteHoras: number }) => i.horizonteHoras === 24),
    ).toBe(true)
    expect(body.items.map((i: { snapshotId: string }) => i.snapshotId)).toEqual([
      's1',
      's2',
      's4',
      's3',
    ])
  })

  it('filtra por departamento (comparación exacta, dato normalizado)', async () => {
    mockAcceso({ ok: true, user: USER })
    const res = await GET(req('?departamento=CONCORDIA'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.total).toBe(1)
    expect(body.items[0].snapshotId).toBe('s3')
    expect(body.items[0].departamento).toBe('CONCORDIA')
  })

  it('pagina con total y totalPages correctos', async () => {
    mockAcceso({ ok: true, user: USER })

    const primera = await (await GET(req('?horizonte=24&page=1&pageSize=2'))).json()
    expect(primera.items.map((i: { snapshotId: string }) => i.snapshotId)).toEqual(['s1', 's2'])
    expect(primera.total).toBe(4)
    expect(primera.totalPages).toBe(2)
    expect(primera.page).toBe(1)
    expect(primera.pageSize).toBe(2)

    const segunda = await (await GET(req('?horizonte=24&page=2&pageSize=2'))).json()
    expect(segunda.items.map((i: { snapshotId: string }) => i.snapshotId)).toEqual(['s4', 's3'])
    expect(segunda.total).toBe(4)
    expect(segunda.totalPages).toBe(2)
  })

  it('un periodoId que no es el vigente devuelve lista vacía y runVigente null', async () => {
    mockAcceso({ ok: true, user: USER })
    const res = await GET(req('?periodoId=periodo-inexistente'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.items).toEqual([])
    expect(body.total).toBe(0)
    expect(body.runVigente).toBeNull()
  })

  it('un periodoId que coincide con el vigente devuelve el ranking', async () => {
    mockAcceso({ ok: true, user: USER })
    const res = await GET(req(`?periodoId=${PERIODO}`))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.total).toBe(5)
    expect(body.runVigente?.id).toBe(RUN_VIGENTE)
  })

  it('rechaza horizonte inválido con 400', async () => {
    mockAcceso({ ok: true, user: USER })
    const res = await GET(req('?horizonte=99'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('horizonte inválido')
    expect(body.items).toBeUndefined()
  })

  it('rechaza page inválido con 400', async () => {
    mockAcceso({ ok: true, user: USER })
    const res = await GET(req('?page=0'))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('page')
  })

  it('rechaza pageSize fuera de rango con 400', async () => {
    mockAcceso({ ok: true, user: USER })
    const res = await GET(req('?pageSize=500'))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('pageSize')
  })
})
