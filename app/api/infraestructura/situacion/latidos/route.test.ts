import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Ruta from './route'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { verificarAccesoSeccion } from '@/lib/infraestructura/acceso-lectura'

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
vi.mock('@/lib/infraestructura/acceso-lectura', () => ({ verificarAccesoSeccion: vi.fn() }))

usarDbTemporal('situacion-latidos-')

let GET: typeof Ruta.GET
beforeAll(async () => { GET = (await import('./route')).GET })

const admin = { id: 'a', role: 'admin' as const, banned: false, nivelJurIds: [], accesoRecursos: 'todos' as const, recursoIds: [] }

beforeEach(() => {
  vi.mocked(verificarAccesoSeccion).mockReset()
})

describe('GET /api/infraestructura/situacion/latidos', () => {
  it('rechaza a quien no es staff con 403', async () => {
    vi.mocked(verificarAccesoSeccion).mockResolvedValue({ ok: true, user: { ...admin, role: 'consulta' as never } })
    expect((await GET(new Request('http://localhost/api/infraestructura/situacion/latidos'))).status).toBe(403)
  })

  it('devuelve las corridas de las últimas 72 h por job: completadas y fallidas, sin las viejas ni las en curso', async () => {
    vi.mocked(verificarAccesoSeccion).mockResolvedValue({ ok: true, user: admin })
    const { getDb } = await import('@/lib/db')
    const { infraJobRun } = await import('@/lib/db/schema')
    const { JOBS_ESPERADOS } = await import('@/lib/infraestructura/riesgo/jobs-esperados')
    const job = JOBS_ESPERADOS.find((j) => j.tipo !== null)!
    const hace = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString()
    const fila = (id: string, estado: string, h: number) => ({
      id, tipo: job.tipo as string, claveIdempotente: id, intento: 1, iniciadoEn: hace(h), finalizadoEn: hace(h), estado,
      version: 'v1', creadaEn: hace(h), actualizadaEn: hace(h),
    })
    await getDb().insert(infraJobRun).values([
      fila('ok-1', 'completado', 5), fila('falla-1', 'fallido', 3), fila('curso-1', 'en_progreso', 1), fila('vieja-1', 'completado', 100),
    ])
    const res = await GET(new Request('http://localhost/api/infraestructura/situacion/latidos'))
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    const body = await res.json()
    const corridas = body.corridas[`job:${job.nombre}`] as Array<{ ok: boolean }>
    expect(corridas.map((c) => c.ok).sort()).toEqual([false, true])
  })
})
