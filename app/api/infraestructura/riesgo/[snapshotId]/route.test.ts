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

const SNAPSHOT = 'snapshot-1'
const CUE = '1000000-01'

usarDbTemporal('riesgo-detalle-route-', { seed: false })

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
    modeloVersion: 'motor-v0.4',
    iniciadoEn: '2026-01-01T00:00:00Z',
    publicadoEn: '2026-01-02T00:00:00Z',
    estado: 'vigente',
    cobertura: { procesadas: 1 },
    creadaEn: '2026-01-01T00:00:00Z',
  })

  await db.insert(infraRiskSnapshot).values({
    id: SNAPSHOT,
    runId: RUN,
    cueAnexo: CUE,
    horizonteHoras: 24,
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
      snapshotId: SNAPSHOT,
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
      snapshotId: SNAPSHOT,
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

function ctx(snapshotId: string) {
  return { params: Promise.resolve({ snapshotId }) }
}

function req() {
  return new Request(`http://localhost/api/infraestructura/riesgo/${SNAPSHOT}`)
}

describe('GET /api/infraestructura/riesgo/[snapshotId]', () => {
  it('rechaza sin sesión con 401', async () => {
    mockAcceso({ ok: false, status: 401 })
    const res = await GET(req(), ctx(SNAPSHOT))
    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe('No autenticado')
  })

  it('rechaza con sesión pero sin acceso al recurso con 403', async () => {
    mockAcceso({ ok: false, status: 403 })
    const res = await GET(req(), ctx(SNAPSHOT))
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('No tiene acceso a este recurso')
  })

  it('rechaza 403 a un usuario sin acceso al recurso (p. ej. el director)', async () => {
    mockAcceso({ ok: false, status: 403 })
    const res = await GET(req(), ctx(SNAPSHOT))
    expect(res.status).toBe(403)
  })

  it('devuelve 404 si el snapshot no existe', async () => {
    mockAcceso({ ok: true, user: USER })
    const res = await GET(req(), ctx('snapshot-inexistente'))
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('Snapshot no encontrado')
  })

  it('devuelve 404 si el snapshot pertenece a un run no vigente', async () => {
    const db = getDb()
    await db.insert(infraRiskRun).values({
      id: 'run-preparando',
      periodoId: PERIODO,
      modeloVersion: 'motor-v0.4',
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
    const res = await GET(req(), ctx('snapshot-preparando'))
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('Snapshot no encontrado')
  })

  it('rechaza snapshotId vacío con 400', async () => {
    mockAcceso({ ok: true, user: USER })
    const res = await GET(req(), ctx(''))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('snapshotId inválido')
  })

  it('con acceso devuelve el snapshot y sus factores', async () => {
    mockAcceso({ ok: true, user: USER })
    const res = await GET(req(), ctx(SNAPSHOT))
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')

    const body = await res.json()
    expect(body.snapshot.id).toBe(SNAPSHOT)
    expect(body.snapshot.runId).toBe(RUN)
    expect(body.snapshot.cueAnexo).toBe(CUE)
    expect(body.snapshot.horizonteHoras).toBe(24)
    expect(body.snapshot.evidenciaValida).toBe(true)
    expect(body.snapshot.scoreRiesgo).toBe(80)
    expect(body.snapshot.nivelRiesgo).toBe('muy_alto')
    expect(body.snapshot.scoreAmenaza).toBe(70)
    expect(body.snapshot.nivelAmenaza).toBe('alto')
    expect(body.snapshot.confianza).toBe('alta')
    expect(body.snapshot.calculadoEn).toBe('2026-01-02T00:00:00Z')
    expect(body.snapshot.validoHasta).toBe('2026-01-03T00:00:00Z')

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
