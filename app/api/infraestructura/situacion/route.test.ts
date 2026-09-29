import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getSessionUser } from '@/lib/session'

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

usarDbTemporal('situacion-route-')

beforeEach(() => {
  vi.mocked(getSessionUser).mockReset()
})

function editor() {
  return { id: 'editor-1', role: 'editor' as const, banned: false, nivelIds: [], accesoRecursos: 'todos' as const, recursoIds: [] }
}
function consulta() {
  return { id: 'consulta-1', role: 'consulta' as const, banned: false, nivelIds: [], accesoRecursos: 'todos' as const, recursoIds: [] }
}

function url(qs = ''): Request {
  return new Request(`http://localhost/api/infraestructura/situacion${qs}`)
}

describe('GET /api/infraestructura/situacion', () => {
  it('rechaza sin sesión con 401', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    const { GET } = await import('./route')
    const res = await GET(url())
    expect(res.status).toBe(401)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('rechaza a consulta (no staff) con 403 — panel ejecutivo interno', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(consulta())
    const { GET } = await import('./route')
    const res = await GET(url())
    expect(res.status).toBe(403)
  })

  it('sin ningún corte todavía, responde 200 con corte null y atraso.atrasado true', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(editor())
    const { GET } = await import('./route')
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
    const { GET } = await import('./route')
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
      modeloVersion: 'riesgo-v0',
      iniciadoEn: '2026-09-27T10:00:00.000Z',
      publicadoEn: '2026-09-27T10:05:00.000Z',
      estado: 'vigente',
      cobertura: { procesadas: 5, conEvidencia: 4, sinEvidencia: 1 },
      creadaEn: '2026-09-27T10:00:00.000Z',
    })
    await generarCorte({ ahora: new Date(), jobRunId: null })

    const { GET } = await import('./route')
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
})
