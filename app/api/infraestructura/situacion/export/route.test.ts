import { randomUUID } from 'node:crypto'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getSessionUser } from '@/lib/session'

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

usarDbTemporal('situacion-export-route-')

beforeEach(() => {
  vi.mocked(getSessionUser).mockReset()
})

function editor() {
  return { id: 'editor-1', role: 'editor' as const, banned: false, nivelJurIds: [], accesoRecursos: 'todos' as const, recursoIds: [] }
}

function url(qs = ''): Request {
  return new Request(`http://localhost/api/infraestructura/situacion/export${qs}`)
}

describe('GET /api/infraestructura/situacion/export', () => {
  it('rechaza sin sesión con 401', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    const { GET } = await import('./route')
    const res = await GET(url())
    expect(res.status).toBe(401)
  })

  it('sin ningún corte todavía, devuelve 404', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(editor())
    const { GET } = await import('./route')
    const res = await GET(url())
    expect(res.status).toBe(404)
  })

  it('formato inválido devuelve 400', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(editor())
    const { GET } = await import('./route')
    const res = await GET(url('?formato=xml'))
    expect(res.status).toBe(400)
  })

  describe('con un corte persistido', () => {
    beforeAll(async () => {
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
    })

    it('formato=json devuelve el corte completo con conteos', async () => {
      vi.mocked(getSessionUser).mockResolvedValue(editor())
      const { GET } = await import('./route')
      const res = await GET(url('?formato=json'))
      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Disposition')).toMatch(/attachment/)
      const body = await res.json()
      expect(body).toHaveProperty('kpis')
      expect(body).toHaveProperty('conteosPorNivelRiesgo')
    })

    it('formato=csv devuelve un CSV con encabezado y una fila por nivel', async () => {
      vi.mocked(getSessionUser).mockResolvedValue(editor())
      const { GET } = await import('./route')
      const res = await GET(url('?formato=csv'))
      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toMatch(/text\/csv/)
      const texto = await res.text()
      const lineas = texto.trim().split('\r\n')
      expect(lineas[0]).toMatch(/"corteId","generadoEn","nivelRiesgo","conteo"/)
      expect(lineas.length).toBeGreaterThanOrEqual(1)
    })
  })
})
