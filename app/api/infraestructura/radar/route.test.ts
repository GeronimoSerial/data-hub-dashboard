import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/acl'
import { getDb } from '@/lib/db'
import {
  hazardEnsembleProb,
  infraGeoProfile,
  infraRiskFactor,
  infraRiskRun,
  infraRiskSnapshot,
} from '@/lib/db/schema'
import type { AccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { obtenerNivelesPeligro } from '@/lib/infraestructura/riesgo/peligro/nivel'
import type * as NivelPeligroModule from '@/lib/infraestructura/riesgo/peligro/nivel'

// Factory puro (sin importOriginal) para no arrastrar @/lib/session -> @/lib/db
// antes de que el beforeAll fije DATA_DIR.
vi.mock('@/lib/infraestructura/acceso-lectura', () => ({
  verificarAccesoLectura: vi.fn(),
}))

// Se envuelve el obtenerNivelesPeligro real (no se reemplaza): el test quiere
// el cómputo de peligro contra la DB de test y, además, espiar el `ahora`
// as-of con el que se lo invoca.
vi.mock('@/lib/infraestructura/riesgo/peligro/nivel', async (importOriginal) => {
  const actual = await importOriginal<typeof NivelPeligroModule>()
  return {
    ...actual,
    obtenerNivelesPeligro: vi.fn(actual.obtenerNivelesPeligro),
  }
})

const USER: SessionUser = { id: 'u1', role: 'consulta', banned: false, nivelIds: [] }

function mockAcceso(acceso: AccesoLectura) {
  vi.mocked(verificarAccesoLectura).mockResolvedValue(acceso)
}

const RUN_VIGENTE = 'run-vigente'
const RUN_VIEJO = 'run-viejo'
const PUBLICADO_EN = '2026-01-02T00:00:00Z'

// cueAnexo → departamento y celda (geometryRef) con la que se agrega el peligro.
const GEO = [
  { cueAnexo: '1000000-01', departamento: 'ALFA', geometryRef: 'celda-a' },
  { cueAnexo: '1000000-02', departamento: 'ALFA', geometryRef: 'celda-a' },
  { cueAnexo: '1000000-03', departamento: 'BETA', geometryRef: 'celda-b' },
  { cueAnexo: '1000000-04', departamento: 'ALFA', geometryRef: 'celda-c' },
  { cueAnexo: '1000000-05', departamento: 'ALFA', geometryRef: 'celda-a' },
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
  await db.delete(hazardEnsembleProb)
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
      geometryRef: g.geometryRef,
      motivoExclusion: null,
      perfilVersion: 'v1',
      calculadoEn: '2026-01-01T00:00:00Z',
    })),
  )

  // Peligro: celda-a tiene ensemble en 24h (rojo) y 72h (amarillo). En 240h no
  // hay determinístico → sin_dato. celda-b y celda-c no tienen dato alguno.
  await db.insert(hazardEnsembleProb).values([
    {
      id: 'e1',
      geometryRef: 'celda-a',
      variable: 'precipitacion_24h',
      corridaEn: '2026-01-01T00:00:00Z',
      validoEn: '2026-01-02T00:00:00Z',
      horizonteHoras: 24,
      miembrosTotal: 51,
      miembrosValidos: 51,
      probabilidadP95: 0.6,
      probabilidadP99: 0.6,
      dispersion: 1,
      version: 'ensemble-v1',
      ingeridoEn: '2026-01-01T00:00:00Z',
    },
    {
      id: 'e2',
      geometryRef: 'celda-a',
      variable: 'precipitacion_24h',
      corridaEn: '2026-01-01T00:00:00Z',
      validoEn: '2026-01-04T00:00:00Z',
      horizonteHoras: 72,
      miembrosTotal: 51,
      miembrosValidos: 51,
      probabilidadP95: 0.2,
      probabilidadP99: 0,
      dispersion: 1,
      version: 'ensemble-v1',
      ingeridoEn: '2026-01-01T00:00:00Z',
    },
  ])

  await db.insert(infraRiskRun).values([
    {
      id: RUN_VIGENTE,
      periodoId: PERIODO,
      modeloVersion: 'riesgo-v0',
      iniciadoEn: '2026-01-01T00:00:00Z',
      publicadoEn: PUBLICADO_EN,
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
  dir = mkdtempSync(path.join(tmpdir(), 'radar-route-'))
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
  vi.mocked(obtenerNivelesPeligro).mockClear()
  await sembrarFixture()
})

function req(qs = '') {
  return new Request(`http://localhost/api/infraestructura/radar${qs}`)
}

const ITEM_KEYS = [
  'calculadoEn',
  'confianza',
  'cueAnexo',
  'departamento',
  'evidenciaValida',
  'exposicionMatricula',
  'exposicionSecciones',
  'horizonteHoras',
  'nivelRiesgo',
  'scoreAmenaza',
  'scoreRiesgo',
  'scoreVulnerabilidad',
  'snapshotId',
  'validoHasta',
].sort()

const DEPARTAMENTOS_ESPERADOS = [
  { departamento: 'ALFA', peorNivel: 'rojo', horizonteHoras: 24, celdas: 2 },
  { departamento: 'ALFA', peorNivel: 'amarillo', horizonteHoras: 72, celdas: 2 },
  { departamento: 'ALFA', peorNivel: 'sin_dato', horizonteHoras: 240, celdas: 2 },
  { departamento: 'BETA', peorNivel: 'sin_dato', horizonteHoras: 24, celdas: 1 },
  { departamento: 'BETA', peorNivel: 'sin_dato', horizonteHoras: 72, celdas: 1 },
  { departamento: 'BETA', peorNivel: 'sin_dato', horizonteHoras: 240, celdas: 1 },
]

function claves(payload: unknown, acc: Set<string> = new Set()): Set<string> {
  if (Array.isArray(payload)) {
    for (const valor of payload) claves(valor, acc)
    return acc
  }
  if (payload !== null && typeof payload === 'object') {
    for (const [clave, valor] of Object.entries(payload)) {
      acc.add(clave)
      claves(valor, acc)
    }
  }
  return acc
}

describe('GET /api/infraestructura/radar', () => {
  it('rechaza sin sesión con 401', async () => {
    mockAcceso({ ok: false, status: 401 })
    const { GET } = await import('./route')
    const res = await GET(req())
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('No autenticado')
    expect(body.corte).toBeUndefined()
  })

  it('rechaza con sesión pero sin acceso al recurso con 403', async () => {
    mockAcceso({ ok: false, status: 403 })
    const { GET } = await import('./route')
    const res = await GET(req())
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('No tiene acceso a este recurso')
  })

  it('sin run vigente devuelve 200 con todo vacío (no es un error)', async () => {
    mockAcceso({ ok: true, user: USER })
    await limpiarMotor()
    const { GET } = await import('./route')
    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')

    const body = await res.json()
    expect(body.corte).toBeNull()
    expect(body.cobertura).toBeNull()
    expect(body.departamentos).toEqual([])
    expect(body.escuelas).toEqual({
      items: [],
      page: 1,
      pageSize: 50,
      total: 0,
      totalPages: 0,
    })
    expect(body.kpis).toEqual({ riesgoAltoTotal: 0, sinEvidenciaTotal: 0 })
    expect(obtenerNivelesPeligro).not.toHaveBeenCalled()
  })

  it('con run vigente devuelve corte, cobertura, escuelas, kpis y peligro por departamento', async () => {
    mockAcceso({ ok: true, user: USER })
    const { GET } = await import('./route')
    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')

    const body = await res.json()

    expect(body.corte).toEqual({
      runId: RUN_VIGENTE,
      publicadoEn: PUBLICADO_EN,
      modeloVersion: 'riesgo-v0',
    })
    expect(body.cobertura).toEqual({
      procesadas: 5,
      conEvidencia: 4,
      sinEvidencia: 1,
    })

    expect(body.escuelas.page).toBe(1)
    expect(body.escuelas.pageSize).toBe(50)
    expect(body.escuelas.total).toBe(5)
    expect(body.escuelas.totalPages).toBe(1)
    expect(
      body.escuelas.items.map((i: { snapshotId: string }) => i.snapshotId),
    ).toEqual(['s1', 's5', 's2', 's4', 's3'])
    expect(body.escuelas.items.at(-1).evidenciaValida).toBe(false)
    expect(
      body.escuelas.items.some(
        (i: { snapshotId: string }) => i.snapshotId === 's6',
      ),
    ).toBe(false)

    expect(body.departamentos).toEqual(DEPARTAMENTOS_ESPERADOS)

    expect(body.kpis).toEqual({ riesgoAltoTotal: 2, sinEvidenciaTotal: 1 })

    // El peligro se pidió "as-of" la publicación del run (no Date.now()).
    expect(obtenerNivelesPeligro).toHaveBeenCalledTimes(1)
    expect(obtenerNivelesPeligro).toHaveBeenCalledWith({
      ahora: new Date(PUBLICADO_EN),
    })
  })

  it('filtra escuelas y kpis por horizonte sin recortar los horizontes del peligro', async () => {
    mockAcceso({ ok: true, user: USER })
    const { GET } = await import('./route')
    const body = await (await GET(req('?horizonte=24'))).json()

    expect(body.escuelas.total).toBe(4)
    expect(
      body.escuelas.items.map((i: { snapshotId: string }) => i.snapshotId),
    ).toEqual(['s1', 's2', 's4', 's3'])
    expect(body.kpis).toEqual({ riesgoAltoTotal: 1, sinEvidenciaTotal: 1 })

    // El corte de peligro siempre trae los 3 horizontes.
    expect(body.departamentos).toEqual(DEPARTAMENTOS_ESPERADOS)
  })

  it('filtra escuelas, kpis y departamentos por departamento', async () => {
    mockAcceso({ ok: true, user: USER })
    const { GET } = await import('./route')
    const body = await (await GET(req('?departamento=BETA'))).json()

    expect(body.escuelas.total).toBe(1)
    expect(body.escuelas.items[0].snapshotId).toBe('s3')
    expect(body.escuelas.items[0].departamento).toBe('BETA')
    expect(body.kpis).toEqual({ riesgoAltoTotal: 0, sinEvidenciaTotal: 1 })
    expect(body.departamentos).toEqual([
      { departamento: 'BETA', peorNivel: 'sin_dato', horizonteHoras: 24, celdas: 1 },
      { departamento: 'BETA', peorNivel: 'sin_dato', horizonteHoras: 72, celdas: 1 },
      { departamento: 'BETA', peorNivel: 'sin_dato', horizonteHoras: 240, celdas: 1 },
    ])
  })

  it('filtra por nivel de riesgo y mantiene los kpis sobre el mismo universo', async () => {
    mockAcceso({ ok: true, user: USER })
    const { GET } = await import('./route')

    const alto = await (await GET(req('?nivel=alto'))).json()
    expect(alto.escuelas.total).toBe(1)
    expect(alto.escuelas.items[0].snapshotId).toBe('s5')
    expect(alto.kpis).toEqual({ riesgoAltoTotal: 1, sinEvidenciaTotal: 0 })

    const bajo = await (await GET(req('?nivel=bajo'))).json()
    expect(bajo.escuelas.total).toBe(1)
    expect(bajo.escuelas.items[0].snapshotId).toBe('s4')
    expect(bajo.kpis).toEqual({ riesgoAltoTotal: 0, sinEvidenciaTotal: 0 })
  })

  it('pagina escuelas con total y totalPages correctos', async () => {
    mockAcceso({ ok: true, user: USER })
    const { GET } = await import('./route')

    const primera = await (await GET(req('?horizonte=24&page=1&pageSize=2'))).json()
    expect(primera.escuelas.items.map((i: { snapshotId: string }) => i.snapshotId)).toEqual([
      's1',
      's2',
    ])
    expect(primera.escuelas.total).toBe(4)
    expect(primera.escuelas.totalPages).toBe(2)

    const segunda = await (await GET(req('?horizonte=24&page=2&pageSize=2'))).json()
    expect(segunda.escuelas.items.map((i: { snapshotId: string }) => i.snapshotId)).toEqual([
      's4',
      's3',
    ])
  })

  it('rechaza parámetros inválidos con 400', async () => {
    mockAcceso({ ok: true, user: USER })
    const { GET } = await import('./route')

    const horizonteInvalido = await GET(req('?horizonte=99'))
    expect(horizonteInvalido.status).toBe(400)
    expect((await horizonteInvalido.json()).error).toBe('horizonte inválido')

    const nivelInvalido = await GET(req('?nivel=extremo'))
    expect(nivelInvalido.status).toBe(400)
    expect((await nivelInvalido.json()).error).toContain('nivel')

    const pageInvalido = await GET(req('?page=0'))
    expect(pageInvalido.status).toBe(400)
    expect((await pageInvalido.json()).error).toContain('page')

    const pageSizeInvalido = await GET(req('?pageSize=500'))
    expect(pageSizeInvalido.status).toBe(400)
    expect((await pageSizeInvalido.json()).error).toContain('pageSize')
  })

  it('no expone ningún campo nominal (escuela, alumno, docente ni persona)', async () => {
    mockAcceso({ ok: true, user: USER })
    const { GET } = await import('./route')
    const body = await (await GET(req())).json()

    const prohibidas = [...claves(body)].filter((clave) =>
      /nombre|alumno|docente|persona|apellido|dni|legajo/i.test(clave),
    )
    expect(prohibidas).toEqual([])

    for (const item of body.escuelas.items) {
      expect(Object.keys(item).sort()).toEqual(ITEM_KEYS)
    }
  })
})
