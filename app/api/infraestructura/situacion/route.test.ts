import { randomUUID } from 'node:crypto'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Ruta from './route'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getSessionUser } from '@/lib/session'
import { verificarAccesoSeccion } from '@/lib/infraestructura/acceso-lectura'

// Mismo motivo que operacion/salud/route.test.ts: reimplementa staffGuard acá
// para no arrastrar @/lib/auth -> @/lib/db antes de fijar DATA_DIR.
vi.mock('@/lib/session', () => ({
  getSessionUser: vi.fn(),
  staffGuard: (user: { banned: boolean; role: string } | null) => {
    if (!user) return { status: 401 as const, error: 'No autenticado' }
    if (user.banned || (user.role !== 'admin' && user.role !== 'editor')) {
      return { status: 403 as const, error: 'No tiene acceso a este recurso' }
    }
    return null
  },
}))
vi.mock('@/lib/infraestructura/acceso-lectura', () => ({
  verificarAccesoSeccion: vi.fn(async () => ({ ok: true, user: { id: 'admin', role: 'admin', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [] } })),
}))

usarDbTemporal('situacion-route-')

let GET: typeof Ruta.GET
beforeAll(async () => { GET = (await import('./route')).GET })

beforeEach(() => {
  vi.mocked(getSessionUser).mockReset()
  vi.mocked(verificarAccesoSeccion).mockResolvedValue({ ok: true, user: { id: 'admin', role: 'admin', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [] } })
})

function editor() {
  return { id: 'editor-1', role: 'editor' as const, banned: false, nivelJurIds: [], accesoRecursos: 'todos' as const, recursoIds: [] }
}
function consulta() {
  return { id: 'consulta-1', role: 'consulta' as const, banned: false, nivelJurIds: [], accesoRecursos: 'todos' as const, recursoIds: [] }
}

function url(qs = ''): Request {
  return new Request(`http://localhost/api/infraestructura/situacion${qs}`)
}

describe('GET /api/infraestructura/situacion', () => {
  it('rechaza a un usuario sólo de infraestructura con 403', async () => {
    vi.mocked(verificarAccesoSeccion).mockResolvedValue({ ok: false, status: 403 })
    expect((await GET(url())).status).toBe(403)
    expect(verificarAccesoSeccion).toHaveBeenCalledWith('situation')
  })
  it('allows situation-only staff without an infrastructure resource grant', async () => {
    vi.mocked(verificarAccesoSeccion).mockResolvedValue({ ok: true, user: { ...editor(), hubPolicy: { enabledSections: ['situation'] as const } } })
    const res = await GET(url())
    expect(res.status).toBe(200)
    expect(verificarAccesoSeccion).toHaveBeenCalledWith('situation')
  })
  it('rechaza sin sesión con 401', async () => {
    vi.mocked(verificarAccesoSeccion).mockResolvedValue({ ok: false, status: 401 })
    const res = await GET(url())
    expect(res.status).toBe(401)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('rechaza a consulta (no staff) con 403 — panel ejecutivo interno', async () => {
    vi.mocked(verificarAccesoSeccion).mockResolvedValue({ ok: true, user: consulta() })
    const res = await GET(url())
    expect(res.status).toBe(403)
  })

  it('sin ningún corte todavía, responde 200 con corte null y atraso.atrasado true', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(editor())
    const res = await GET(url())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.corte).toBeNull()
    expect(body.briefing).toEqual([])
    expect(body.atraso.atrasado).toBe(true)
    expect(body.prioridades).toEqual([])
  })

  it('territorioId sin territorioTipo devuelve 400', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(editor())
    const res = await GET(url('?territorioId=PARANA'))
    expect(res.status).toBe(400)
  })

  it('con un corte persistido, expone kpis/briefing/salud sin datos nominales', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(editor())
    const { getDb } = await import('@/lib/db')
    const { infraRiskRun } = await import('@/lib/db/schema')
    const { PERIODO_ENOS_2026_2027_ID } = await import('@/lib/db/seed')
    const { generarCorte } = await import('@/lib/infraestructura/riesgo/situacion/corte')

    const db = getDb()
    await db.insert(infraRiskRun).values({
      id: randomUUID(),
      periodoId: PERIODO_ENOS_2026_2027_ID,
      modeloVersion: 'motor-v0.4',
      iniciadoEn: '2026-09-27T10:00:00.000Z',
      publicadoEn: '2026-09-27T10:05:00.000Z',
      estado: 'vigente',
      cobertura: { procesadas: 5, conEvidencia: 4, sinEvidencia: 1 },
      creadaEn: '2026-09-27T10:00:00.000Z',
    })
    await generarCorte({ ahora: new Date(), jobRunId: null })

    const res = await GET(url())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.corte).not.toBeNull()
    expect(Object.keys(body.corte.kpis).sort()).toEqual([
      'escuelasAfectacionConfirmadaVigente',
      'escuelasRiesgoAlto24h',
      'fuentesVencidas',
    ])
    const texto = JSON.stringify(body)
    expect(texto).not.toMatch(/gePersonId|nombreAlumno/i)
  })
  it('expone estadoDatos con un job fallido primero, aunque tenga un éxito anterior', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(editor())
    const { getDb } = await import('@/lib/db')
    const { infraJobRun } = await import('@/lib/db/schema')
    const ahora = Date.now()
    const iso = (horasAtras: number) => new Date(ahora - horasAtras * 3_600_000).toISOString()
    const fila = { tipo: 'calculo-climatologia-imerg', version: 'v1', intento: 1, errorSaneado: null }
    await getDb().insert(infraJobRun).values([
      { ...fila, id: randomUUID(), claveIdempotente: 'ayer', estado: 'completado', iniciadoEn: iso(25), creadaEn: iso(25), actualizadaEn: iso(24) },
      { ...fila, id: randomUUID(), claveIdempotente: 'hoy', estado: 'fallido', intento: 3, errorSaneado: 'GloFAS respondió 503', iniciadoEn: iso(1), creadaEn: iso(1), actualizadaEn: iso(1) },
    ])

    const res = await GET(url())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.estadoDatos.problemas).toBeGreaterThan(0)
    const [primero] = body.estadoDatos.items
    expect(primero).toMatchObject({ id: 'job:climatologia-imerg', estado: 'fallido', ultimoError: 'GloFAS respondió 503' })
    expect(primero.ultimoExitoEn).not.toBeNull()
  })
})
