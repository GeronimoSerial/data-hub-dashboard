import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Ruta from './route'
import type * as RutaReplay from '../route'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
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
import {
  crearFixtureEscenarioCompleto,
  type FixtureEscenarioCompleto,
} from '@/lib/infraestructura/replay/fixtures'

vi.mock('@/lib/infraestructura/acceso-lectura', () => ({
  verificarAccesoLectura: vi.fn(),
}))

const USER: SessionUser = { id: 'u1', role: 'consulta', banned: false, nivelIds: [], accesoRecursos: 'todos' as const, recursoIds: [] }

function mockAcceso(acceso: AccesoLectura) {
  vi.mocked(verificarAccesoLectura).mockResolvedValue(acceso)
}

usarDbTemporal('replay-export-route-')

let GET: typeof Ruta.GET, GET_REPLAY: typeof RutaReplay.GET

beforeAll(async () => {
  fx = crearFixtureEscenarioCompleto()
  const db = getDb()

  await db.insert(infraPeriodo).values({
    id: fx.periodoId,
    nombre: 'Período fixture E7b (export)',
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
  GET = (await import('./route')).GET
  GET_REPLAY = (await import('../route')).GET
})

let fx: FixtureEscenarioCompleto

beforeEach(() => {
  vi.mocked(verificarAccesoLectura).mockReset()
})

function reqReplay(qs: string) {
  return new Request(`http://localhost/api/infraestructura/replay${qs}`)
}
function reqExport(qs: string) {
  return new Request(`http://localhost/api/infraestructura/replay/export${qs}`)
}

function qsBase(vista: 'conocido' | 'reconstruido', formato?: 'json' | 'csv') {
  const base = `?territorioTipo=departamento&territorioId=${encodeURIComponent(fx.departamento)}&desde=${fx.T0}&hasta=${fx.T1}&paso=6&vista=${vista}`
  return formato ? `${base}&formato=${formato}` : base
}

describe('GET /api/infraestructura/replay/export', () => {
  it('rechaza sin sesión con 401', async () => {
    mockAcceso({ ok: false, status: 401 })
    const res = await GET(reqExport(qsBase('conocido')))
    expect(res.status).toBe(401)
  })

  it('JSON: incluye zona horaria, versión de reglas y cobertura, Cache-Control private no-store', async () => {
    mockAcceso({ ok: true, user: USER })
    const res = await GET(reqExport(qsBase('reconstruido')))
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    const body = await res.json()
    expect(body.zonaHorariaDatos).toBe('UTC')
    expect(body.zonaHorariaArgentinaDocumentada).toContain('Argentina')
    expect(body.versionReglas).toMatchObject({
      motor: expect.any(String),
      peligro: expect.any(String),
      episodios: expect.any(String),
    })
    expect(body.cobertura).toMatchObject({
      snapshotRiesgo: expect.any(Number),
      peligro: expect.any(Number),
      lluvia: expect.any(Number),
    })
    // Sin manifiesto ni hashes (decisión de producto).
    expect(body.manifiesto).toBeUndefined()
    expect(body.hash).toBeUndefined()
  })

  it('CSV: cabecera y una fila por cuadro, Content-Type text/csv', async () => {
    mockAcceso({ ok: true, user: USER })
    const res = await GET(reqExport(qsBase('reconstruido', 'csv')))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/csv')
    const texto = await res.text()
    const lineas = texto.trim().split('\n')
    expect(lineas[0]).toBe(
      'instante,afectacionesConfirmadas,snapshotRiesgoPresente,nivelesPeligro,lluviaObservada,saludFuentes',
    )
    expect(lineas.length).toBeGreaterThan(1)
  })

  it('export = replay en conteos (mismo filtro, misma cantidad de cuadros y de afectaciones por cuadro)', async () => {
    mockAcceso({ ok: true, user: USER })
    const replayBody = await (await GET_REPLAY(reqReplay(qsBase('reconstruido')))).json()
    const exportBody = await (await GET(reqExport(qsBase('reconstruido')))).json()

    expect(exportBody.cuadros).toHaveLength(replayBody.cuadros.length)
    for (let i = 0; i < replayBody.cuadros.length; i++) {
      expect(exportBody.cuadros[i].instante).toBe(replayBody.cuadros[i].instante)
      expect(exportBody.cuadros[i].afectacionesConfirmadas).toBe(
        replayBody.cuadros[i].afectacionesConfirmadas.length,
      )
      expect(exportBody.cuadros[i].snapshotRiesgoPresente).toBe(
        replayBody.cuadros[i].snapshotRiesgo === null ? 0 : 1,
      )
    }
  })

  it('rechaza formato inválido con 400', async () => {
    mockAcceso({ ok: true, user: USER })
    const res = await GET(reqExport(`${qsBase('conocido')}&formato=xml`))
    expect(res.status).toBe(400)
  })
})
