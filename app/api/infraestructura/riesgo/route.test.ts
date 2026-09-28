import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/acl'
import { getDb } from '@/lib/db'
import {
  infraGeoProfile,
  infraRiskFactor,
  infraRiskRun,
  infraRiskSnapshot,
} from '@/lib/db/schema'
import type { AccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'

// Factory puro (sin importOriginal) para no arrastrar @/lib/session -> @/lib/db
// antes de que el beforeAll fije DATA_DIR.
vi.mock('@/lib/infraestructura/acceso-lectura', () => ({
  verificarAccesoLectura: vi.fn(),
}))

const USER: SessionUser = { id: 'u1', role: 'consulta', banned: false, nivelIds: [], accesoRecursos: 'todos' as const, recursoIds: [] }

function mockAcceso(acceso: AccesoLectura) {
  vi.mocked(verificarAccesoLectura).mockResolvedValue(acceso)
}

const RUN_VIGENTE = 'run-vigente'
const RUN_VIEJO = 'run-viejo'

const GEO = [
  { cueAnexo: '1000000-01', departamento: 'PARANA' },
  { cueAnexo: '1000000-02', departamento: 'PARANA' },
  { cueAnexo: '1000000-03', departamento: 'CONCORDIA' },
  { cueAnexo: '1000000-04', departamento: 'PARANA' },
  { cueAnexo: '1000000-05', departamento: 'PARANA' },
]

let dir: string
let prevDataDir: string | undefined
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

  await db.insert(infraRiskRun).values([
    {
      id: RUN_VIGENTE,
      periodoId: PERIODO,
      modeloVersion: 'riesgo-v0',
      iniciadoEn: '2026-01-01T00:00:00Z',
      publicadoEn: '2026-01-02T00:00:00Z',
      estado: 'vigente',
      cobertura: { procesadas: 5, conEvidencia: 4, sinEvidencia: 1 },
      creadaEn: '2026-01-01T00:00:00Z',
    },
    {
      id: RUN_VIEJO,
      periodoId: PERIODO,
      modeloVersion: 'riesgo-v0',
      iniciadoEn: '2025-12-01T00:00:00Z',
      publicadoEn: '2025-12-02T00:00:00Z',
      estado: 'vencido',
      cobertura: null,
      creadaEn: '2025-12-01T00:00:00Z',
    },
  ])

  await db.insert(infraRiskSnapshot).values([
    {
      id: 's1',
      runId: RUN_VIGENTE,
      cueAnexo: '1000000-01',
      horizonteHoras: 24,
      evidenciaValida: true,
      scoreRiesgo: 80,
      nivelRiesgo: 'muy_alto',
      scoreAmenaza: 70,
      scoreVulnerabilidad: 60,
      confianza: 'alta',
      exposicionMatricula: 100,
      exposicionSecciones: 5,
      calculadoEn: '2026-01-02T00:00:00Z',
      validoHasta: '2026-01-03T00:00:00Z',
    },
    {
      id: 's2',
      runId: RUN_VIGENTE,
      cueAnexo: '1000000-02',
      horizonteHoras: 24,
      evidenciaValida: true,
      scoreRiesgo: 50,
      nivelRiesgo: 'moderado',
      scoreAmenaza: 40,
      scoreVulnerabilidad: 35,
      confianza: 'media',
      exposicionMatricula: 80,
      exposicionSecciones: 4,
      calculadoEn: '2026-01-02T00:00:00Z',
      validoHasta: '2026-01-03T00:00:00Z',
    },
    {
      id: 's3',
      runId: RUN_VIGENTE,
      cueAnexo: '1000000-03',
      horizonteHoras: 24,
      evidenciaValida: false,
      scoreRiesgo: null,
      nivelRiesgo: null,
      scoreAmenaza: null,
      scoreVulnerabilidad: null,
      confianza: 'baja',
      exposicionMatricula: null,
      exposicionSecciones: null,
      calculadoEn: '2026-01-02T00:00:00Z',
      validoHasta: '2026-01-03T00:00:00Z',
    },
    {
      id: 's4',
      runId: RUN_VIGENTE,
      cueAnexo: '1000000-04',
      horizonteHoras: 24,
      evidenciaValida: true,
      scoreRiesgo: 30,
      nivelRiesgo: 'bajo',
      scoreAmenaza: 20,
      scoreVulnerabilidad: 15,
      confianza: 'media',
      exposicionMatricula: 60,
      exposicionSecciones: 3,
      calculadoEn: '2026-01-02T00:00:00Z',
      validoHasta: '2026-01-03T00:00:00Z',
    },
    {
      id: 's5',
      runId: RUN_VIGENTE,
      cueAnexo: '1000000-05',
      horizonteHoras: 72,
      evidenciaValida: true,
      scoreRiesgo: 60,
      nivelRiesgo: 'alto',
      scoreAmenaza: 55,
      scoreVulnerabilidad: 45,
      confianza: 'alta',
      exposicionMatricula: 90,
      exposicionSecciones: 4,
      calculadoEn: '2026-01-02T00:00:00Z',
      validoHasta: '2026-01-05T00:00:00Z',
    },
    {
      id: 's6',
      runId: RUN_VIEJO,
      cueAnexo: '1000000-01',
      horizonteHoras: 24,
      evidenciaValida: true,
      scoreRiesgo: 999,
      nivelRiesgo: 'muy_alto',
      scoreAmenaza: 99,
      scoreVulnerabilidad: 99,
      confianza: 'alta',
      exposicionMatricula: 100,
      exposicionSecciones: 5,
      calculadoEn: '2025-12-02T00:00:00Z',
      validoHasta: '2025-12-03T00:00:00Z',
    },
  ])
}

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'riesgo-route-'))
  prevDataDir = process.env.DATA_DIR
  process.env.DATA_DIR = dir

  const seed = await import('@/lib/db/seed')
  await seed.ensureSeeded()
  PERIODO = seed.PERIODO_ENOS_2026_2027_ID
})

afterAll(() => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  rmSync(dir, { recursive: true, force: true })
})

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
    const { GET } = await import('./route')
    const res = await GET(req())
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('No autenticado')
    expect(body.items).toBeUndefined()
  })

  it('rechaza con sesión pero sin acceso al recurso con 403', async () => {
    mockAcceso({ ok: false, status: 403 })
    const { GET } = await import('./route')
    const res = await GET(req())
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('No tiene acceso a este recurso')
  })

  it('rechaza 403 a un usuario sin acceso al recurso (p. ej. el director)', async () => {
    // El director queda excluido dentro de verificarAccesoLectura, que ya está
    // implementado; acá se simula su resultado (403) igual que en los otros tests.
    mockAcceso({ ok: false, status: 403 })
    const { GET } = await import('./route')
    const res = await GET(req())
    expect(res.status).toBe(403)
  })

  it('sin run vigente devuelve 200 con lista vacía (no es un error)', async () => {
    mockAcceso({ ok: true, user: USER })
    await limpiarMotor()
    const { GET } = await import('./route')
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
    const { GET } = await import('./route')
    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')

    const body = await res.json()
    expect(body.total).toBe(5)
    expect(body.totalPages).toBe(1)
    expect(body.runVigente).toEqual({
      id: RUN_VIGENTE,
      modeloVersion: 'riesgo-v0',
      publicadoEn: '2026-01-02T00:00:00Z',
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

  it('filtra por horizonte', async () => {
    mockAcceso({ ok: true, user: USER })
    const { GET } = await import('./route')
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
    const { GET } = await import('./route')
    const res = await GET(req('?departamento=CONCORDIA'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.total).toBe(1)
    expect(body.items[0].snapshotId).toBe('s3')
    expect(body.items[0].departamento).toBe('CONCORDIA')
  })

  it('pagina con total y totalPages correctos', async () => {
    mockAcceso({ ok: true, user: USER })
    const { GET } = await import('./route')

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
    const { GET } = await import('./route')
    const res = await GET(req('?periodoId=periodo-inexistente'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.items).toEqual([])
    expect(body.total).toBe(0)
    expect(body.runVigente).toBeNull()
  })

  it('un periodoId que coincide con el vigente devuelve el ranking', async () => {
    mockAcceso({ ok: true, user: USER })
    const { GET } = await import('./route')
    const res = await GET(req(`?periodoId=${PERIODO}`))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.total).toBe(5)
    expect(body.runVigente?.id).toBe(RUN_VIGENTE)
  })

  it('rechaza horizonte inválido con 400', async () => {
    mockAcceso({ ok: true, user: USER })
    const { GET } = await import('./route')
    const res = await GET(req('?horizonte=99'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('horizonte inválido')
    expect(body.items).toBeUndefined()
  })

  it('rechaza page inválido con 400', async () => {
    mockAcceso({ ok: true, user: USER })
    const { GET } = await import('./route')
    const res = await GET(req('?page=0'))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('page')
  })

  it('rechaza pageSize fuera de rango con 400', async () => {
    mockAcceso({ ok: true, user: USER })
    const { GET } = await import('./route')
    const res = await GET(req('?pageSize=500'))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('pageSize')
  })
})
