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
  RUN_VIGENTE as RUN,
  USER,
} from '@/lib/infraestructura/riesgo/__fixtures__/motor-api'

// Factory puro (sin importOriginal) para no arrastrar @/lib/session -> @/lib/db
// antes de que el beforeAll fije DATA_DIR.
vi.mock('@/lib/infraestructura/acceso-lectura', () => ({
  verificarAccesoLectura: vi.fn(),
}))

const SNAPSHOT_72 = 'snapshot-72'
const CUE = '1000000-01'

usarDbTemporal('riesgo-escuela-route-', { seed: false })

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

  await db.insert(infraGeoProfile).values({
    cueAnexo: CUE,
    lat: -31.7,
    lon: -60.5,
    geoCalidad: 'alta',
    departamento: 'PARANA',
    geometryRef: '-31.7_-60.5',
    motivoExclusion: null,
    perfilVersion: 'v1',
    calculadoEn: '2026-01-01T00:00:00Z',
  })

  await db.insert(infraRiskRun).values({
    id: RUN,
    periodoId: PERIODO,
    modeloVersion: 'riesgo-v0',
    iniciadoEn: '2026-01-01T00:00:00Z',
    publicadoEn: '2026-01-02T00:00:00Z',
    estado: 'vigente',
    cobertura: { procesadas: 1 },
    creadaEn: '2026-01-01T00:00:00Z',
  })

  await db.insert(infraRiskSnapshot).values({
    id: SNAPSHOT_72,
    runId: RUN,
    cueAnexo: CUE,
    horizonteHoras: 72,
    evidenciaValida: true,
    scoreRiesgo: 80,
    nivelRiesgo: 'muy_alto',
    scoreAmenaza: 70,
    nivelAmenaza: 'alto',
    scoreVulnerabilidad: 60,
    confianza: 'alta',
    exposicionMatricula: 100,
    exposicionSecciones: 5,
    calculadoEn: '2026-01-02T00:00:00Z',
    validoHasta: '2026-01-03T00:00:00Z',
  })

  await db.insert(infraRiskFactor).values([
    {
      id: 'fac1',
      snapshotId: SNAPSHOT_72,
      tipo: 'amenaza',
      fuente: 'hazard_forecast',
      variable: 'precipitacion',
      valor: 45,
      unidad: 'mm',
      contribucion: 0.6,
      peso: 0.4,
      explicacion: 'Precipitación prevista sobre el percentil histórico',
      observadoEn: '2026-01-02T00:00:00Z',
    },
    {
      id: 'fac2',
      snapshotId: SNAPSHOT_72,
      tipo: 'vulnerabilidad',
      fuente: 'infra_perfil',
      variable: 'material_techo',
      valor: null,
      unidad: null,
      contribucion: 0.2,
      peso: 0.2,
      explicacion: 'Techo liviano',
      observadoEn: null,
    },
  ])
}

beforeEach(async () => {
  vi.mocked(verificarAccesoLectura).mockReset()
  await sembrarFixture()
})

function ctx(cueAnexo: string) {
  return { params: Promise.resolve({ cueAnexo }) }
}

function req(query = '') {
  return new Request(
    `http://localhost/api/infraestructura/riesgo/escuela/${CUE}${query}`,
  )
}

describe('GET /api/infraestructura/riesgo/escuela/[cueAnexo]', () => {
  it('rechaza sin sesión con 401', async () => {
    mockAcceso({ ok: false, status: 401 })
    const res = await GET(req(), ctx(CUE))
    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe('No autenticado')
  })

  it('rechaza con sesión pero sin acceso al recurso con 403', async () => {
    mockAcceso({ ok: false, status: 403 })
    const res = await GET(req(), ctx(CUE))
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('No tiene acceso a este recurso')
  })

  it('rechaza horizonte fuera de 24|72|240 con 400', async () => {
    mockAcceso({ ok: true, user: USER })
    const res = await GET(req('?horizonte=48'), ctx(CUE))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('horizonte inválido')
  })

  it('devuelve snapshot null y factores vacíos si la escuela no tiene evaluación para el horizonte', async () => {
    mockAcceso({ ok: true, user: USER })
    const res = await GET(req('?horizonte=240'), ctx(CUE))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ snapshot: null, factores: [] })
  })

  it('devuelve snapshot null si la escuela no existe', async () => {
    mockAcceso({ ok: true, user: USER })
    const res = await GET(req(), ctx('9999999-99'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ snapshot: null, factores: [] })
  })

  it('ignora snapshots de un run no vigente', async () => {
    const db = getDb()
    await db.insert(infraRiskRun).values({
      id: 'run-preparando',
      periodoId: PERIODO,
      modeloVersion: 'riesgo-v0',
      iniciadoEn: '2026-01-01T00:00:00Z',
      publicadoEn: null,
      estado: 'preparando',
      cobertura: null,
      creadaEn: '2026-01-01T00:00:00Z',
    })
    await db.insert(infraRiskSnapshot).values({
      id: 'snapshot-preparando',
      runId: 'run-preparando',
      cueAnexo: CUE,
      horizonteHoras: 24,
      evidenciaValida: true,
      scoreRiesgo: 90,
      nivelRiesgo: 'muy_alto',
      scoreAmenaza: 90,
      scoreVulnerabilidad: 90,
      confianza: 'alta',
      exposicionMatricula: 100,
      exposicionSecciones: 5,
      calculadoEn: '2026-01-02T00:00:00Z',
      validoHasta: '2026-01-03T00:00:00Z',
    })

    mockAcceso({ ok: true, user: USER })
    const res = await GET(req('?horizonte=24'), ctx(CUE))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ snapshot: null, factores: [] })
  })

  it('con acceso devuelve el snapshot vigente y sus factores para el horizonte por defecto (72)', async () => {
    mockAcceso({ ok: true, user: USER })
    const res = await GET(req(), ctx(CUE))
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')

    const body = await res.json()
    expect(body.snapshot).toEqual({
      id: SNAPSHOT_72,
      cueAnexo: CUE,
      horizonteHoras: 72,
      nivelRiesgo: 'muy_alto',
      scoreRiesgo: 80,
      nivelAmenaza: 'alto',
      calculadoEn: '2026-01-02T00:00:00Z',
      validoHasta: '2026-01-03T00:00:00Z',
    })

    expect(body.factores).toHaveLength(2)
    const amenaza = body.factores.find((f: { tipo: string }) => f.tipo === 'amenaza')
    expect(amenaza.variable).toBe('precipitacion')
    expect(amenaza.valor).toBe(45)
    expect(amenaza.unidad).toBe('mm')
    expect(amenaza.contribucion).toBe(0.6)
    expect(amenaza.peso).toBe(0.4)
    expect(amenaza.explicacion).toBeTypeOf('string')
    // No se filtran columnas internas del factor.
    expect(amenaza.snapshotId).toBeUndefined()
  })
})
