import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Route from './route'
import { BookletServiceError } from '@/lib/cuadernillos/inventory'
import { addRemitoObservation } from '@/lib/cuadernillos/remito-control'
import { getSessionUser } from '@/lib/session'
import { hubApiAccessResponse } from '@/lib/hub-entry-server'

usarDbTemporal('cuadernillos-remitos-id-observaciones-rutas-')

vi.mock('@/lib/session', () => ({ getSessionUser: vi.fn() }))
vi.mock('@/lib/hub-entry-server', () => ({ hubApiAccessResponse: vi.fn() }))
vi.mock('@/lib/cuadernillos/remito-control', () => ({ addRemitoObservation: vi.fn() }))

let POST: typeof Route.POST
beforeAll(async () => { POST = (await import('./route')).POST })
const observation = { id: 'o1', remitoId: 'rem1', lineId: null, authorUserId: 'sup-1', authorName: 'Sup', body: 'Check', createdAt: '2026-11-14T00:00:00.000Z' }
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getSessionUser).mockResolvedValue({ id: 'sup-1', role: 'consulta', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [] })
  vi.mocked(hubApiAccessResponse).mockResolvedValue(null)
  vi.mocked(addRemitoObservation).mockResolvedValue(observation)
})
const post = (body: unknown, id = 'rem1') => POST(
  new Request(`http://localhost/api/cuadernillos/remitos/${id}/observaciones`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  { params: Promise.resolve({ id }) },
)

describe('POST /api/cuadernillos/remitos/[id]/observaciones', () => {
  it('records the observation as the session actor and answers 201', async () => {
    const response = await post({ lineId: 'l1', body: 'Check' })
    expect(response.status).toBe(201)
    expect(addRemitoObservation).toHaveBeenCalledWith(expect.objectContaining({ id: 'sup-1' }), 'rem1', { lineId: 'l1', body: 'Check' })
    expect(await response.json()).toEqual({ observation })
  })

  it('rejects caller-supplied identity, blank, oversized and missing bodies', async () => {
    for (const payload of [{ body: 'x', authorUserId: 'attacker' }, { body: '   ' }, { body: 'x'.repeat(2001) }, {}, { body: 'x', lineId: '' }]) {
      expect((await post(payload)).status).toBe(400)
    }
    expect(addRemitoObservation).not.toHaveBeenCalled()
  })

  it('rejects an unparseable body', async () => {
    const response = await POST(
      new Request('http://localhost/api/cuadernillos/remitos/rem1/observaciones', { method: 'POST', body: 'not json' }),
      { params: Promise.resolve({ id: 'rem1' }) },
    )
    expect(response.status).toBe(400)
  })

  it('returns the hub denial without calling the service', async () => {
    vi.mocked(hubApiAccessResponse).mockResolvedValue(Response.json({ error: 'Unauthorized' }, { status: 401 }))
    expect((await post({ body: 'x' })).status).toBe(401)
    expect(addRemitoObservation).not.toHaveBeenCalled()
  })

  it('maps service errors (403, 400) and unknown failures to 503', async () => {
    vi.mocked(addRemitoObservation).mockRejectedValueOnce(new BookletServiceError('forbidden', 403))
    expect((await post({ body: 'x' })).status).toBe(403)
    vi.mocked(addRemitoObservation).mockRejectedValueOnce(new BookletServiceError('invalid_line', 400))
    const invalid = await post({ body: 'x', lineId: 'other' })
    expect(invalid.status).toBe(400)
    expect(await invalid.json()).toEqual({ error: 'invalid_line' })
    vi.mocked(addRemitoObservation).mockRejectedValueOnce(new Error('db down'))
    expect((await post({ body: 'x' })).status).toBe(503)
  })
})
