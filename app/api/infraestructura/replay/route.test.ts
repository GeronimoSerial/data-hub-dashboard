import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/acl'
import { getDb } from '@/lib/db'
import {
  infraAfectacion,
  infraGeoProfile,
  infraParte,
  infraPeriodo,
  infraRiskRun,
  infraRiskSnapshot,
} from '@/lib/db/schema'
import type { AccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { crearFixtureEscenarioCompleto, type FixtureEscenarioCompleto } from '@/lib/infraestructura/replay/fixtures'

vi.mock('@/lib/infraestructura/acceso-lectura', () => ({
  verificarAccesoLectura: vi.fn(),
}))

const USER: SessionUser = { id: 'u1', role: 'consulta', banned: false, nivelIds: [], accesoRecursos: 'todos' as const, recursoIds: [] }

function mockAcceso(acceso: AccesoLectura) {
  vi.mocked(verificarAccesoLectura).mockResolvedValue(acceso)
}

let dir: string
let prevDataDir: string | undefined
let fx: FixtureEscenarioCompleto

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'replay-route-'))
  prevDataDir = process.env.DATA_DIR
  process.env.DATA_DIR = dir

  const { ensureSeeded } = await import('@/lib/db/seed')
  await ensureSeeded()

  fx = crearFixtureEscenarioCompleto()
  const db = getDb()

  await db.insert(infraPeriodo).values({
    id: fx.periodoId,
    nombre: 'Período fixture E7b (ruta)',
    inicioEn: '2026-01-01T00:00:00.000Z',
    finEn: null,
    estado: 'historico',
    creadaEn: '2026-01-01T00:00:00.000Z',
  })
  await db.insert(infraGeoProfile).values({
    cueAnexo: fx.cueAnexo,
    lat: -31.73,
    lon: -60.52,
    geoCalidad: 'alta',
    departamento: fx.departamento,
    geometryRef: fx.geometryRef,
    motivoExclusion: null,
    perfilVersion: 'geo-perfil-v1',
    calculadoEn: fx.T0,
  })
  await db.insert(infraParte).values({
    id: fx.afectacion.parteId,
    periodoId: fx.periodoId,
    cueAnexo: fx.cueAnexo,
    estadoEstablecimiento: 'habitual',
    estadoEstablecimientoRigeDesde: fx.rigeDesde,
    corteId: 1,
    creadaEn: fx.creadaEn,
    actualizadaEn: fx.creadaEn,
  })
  const { cueAnexo: _cueAnexo, ...afectacionRow } = fx.afectacion
  await db.insert(infraAfectacion).values(afectacionRow)
  await db.insert(infraRiskRun).values(fx.snapshot.run)
  await db.insert(infraRiskSnapshot).values(fx.snapshot.porEscuela)
})

afterAll(() => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  rmSync(dir, { recursive: true, force: true })
})

beforeEach(() => {
  vi.mocked(verificarAccesoLectura).mockReset()
})

function req(qs: string) {
  return new Request(`http://localhost/api/infraestructura/replay${qs}`)
}

function qsBase(fx: FixtureEscenarioCompleto, vista: 'conocido' | 'reconstruido') {
  return `?territorioTipo=departamento&territorioId=${encodeURIComponent(fx.departamento)}&desde=${fx.T0}&hasta=${fx.T1}&paso=6&vista=${vista}`
}

describe('GET /api/infraestructura/replay', () => {
  it('rechaza sin sesión con 401', async () => {
    mockAcceso({ ok: false, status: 401 })
    const { GET } = await import('./route')
    const res = await GET(req(qsBase(fx, 'conocido')))
    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe('No autenticado')
  })

  it('rechaza con sesión pero sin acceso con 403', async () => {
    mockAcceso({ ok: false, status: 403 })
    const { GET } = await import('./route')
    const res = await GET(req(qsBase(fx, 'conocido')))
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('No tiene acceso a este recurso')
  })

  it('con ACL ok devuelve cuadros con Cache-Control private, no-store', async () => {
    mockAcceso({ ok: true, user: USER })
    const { GET } = await import('./route')
    const res = await GET(req(qsBase(fx, 'conocido')))
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    const body = await res.json()
    expect(Array.isArray(body.cuadros)).toBe(true)
    expect(body.cuadros.length).toBeGreaterThan(0)
    expect(body.vacios).toHaveLength(body.cuadros.length)
  })

  it('vista conocido NO ve la corrección tardía antes de creadaEn', async () => {
    mockAcceso({ ok: true, user: USER })
    const { GET } = await import('./route')
    const res = await GET(req(qsBase(fx, 'conocido')))
    const body = await res.json()
    for (const cuadro of body.cuadros) {
      expect(cuadro.afectacionesConfirmadas).toHaveLength(0)
    }
  })

  it('vista reconstruido SÍ ve la afectación (rigeDesde anterior al corte)', async () => {
    mockAcceso({ ok: true, user: USER })
    const { GET } = await import('./route')
    const res = await GET(req(qsBase(fx, 'reconstruido')))
    const body = await res.json()
    for (const cuadro of body.cuadros) {
      expect(cuadro.afectacionesConfirmadas).toHaveLength(1)
    }
  })

  it('rechaza parámetros inválidos con 400 (falta desde/hasta/episodio)', async () => {
    mockAcceso({ ok: true, user: USER })
    const { GET } = await import('./route')
    const res = await GET(req('?territorioId=X&vista=conocido'))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBeTruthy()
  })

  it('404 con episodioDerivadoId inexistente', async () => {
    mockAcceso({ ok: true, user: USER })
    const { GET } = await import('./route')
    const res = await GET(req('?episodioDerivadoId=no-existe&vista=conocido'))
    expect(res.status).toBe(404)
  })
})
