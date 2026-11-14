import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Route from './route'
import { getSessionUser } from '@/lib/session'
import { hubApiAccessResponse } from '@/lib/hub-entry-server'

usarDbTemporal('cuadernillos-remitos-rutas-')

const service = vi.hoisted(() => ({ dispatchRemito: vi.fn(), listRemitosForPlanning: vi.fn() }))
vi.mock('@/lib/cuadernillos/ge-conexion', () => ({ prepararEsquemaGe: vi.fn(async () => ({})) }))
vi.mock('@/lib/session', () => ({ getSessionUser: vi.fn() }))
vi.mock('@/lib/hub-entry-server', () => ({ hubApiAccessResponse: vi.fn() }))
vi.mock('@/lib/cuadernillos/remito-dispatch', async () => {
  const { BookletServiceError } = await import('@/lib/cuadernillos/inventory')
  class RemitoDispatchError extends BookletServiceError {
    readonly details: Record<string, string[]>
    constructor(code: string, status: number, details: Record<string, string[]>) { super(code, status); this.details = details }
  }
  return { ...service, RemitoDispatchError }
})

let POST: typeof Route.POST
let GET: typeof Route.GET
beforeAll(async () => { const route = await import('./route'); POST = route.POST; GET = route.GET })

const dispatched = { remitoId: 'rem-1', status: 'dispatched', lines: [] }
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getSessionUser).mockResolvedValue({ id: 'session-user', role: 'consulta', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [] })
  vi.mocked(hubApiAccessResponse).mockResolvedValue(null)
  service.dispatchRemito.mockResolvedValue(dispatched)
  service.listRemitosForPlanning.mockResolvedValue({ remitos: [], hasMore: false, nextCursor: null })
})

const body = {
  campaignId: 'campaign-1', cabeceraCueAnexo: '180000100', idempotencyKey: 'key-1',
  lines: [{ recipientCueAnexo: '180000200', items: [{ productId: 'product-1', quantity: 30 }] }],
}
const post = (value: unknown) => new Request('http://localhost/api/cuadernillos/remitos', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) })

describe('POST /api/cuadernillos/remitos', () => {
  it('dispatches with the session actor and returns 201', async () => {
    const response = await POST(post(body))
    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ remito: dispatched })
    expect(service.dispatchRemito).toHaveBeenCalledWith(expect.objectContaining({ id: 'session-user' }), body)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('rejects caller-supplied authority fields and malformed bodies', async () => {
    for (const value of [{ ...body, actorId: 'attacker' }, { ...body, lines: [] }, { ...body, cabeceraCueAnexo: '18' },
      { ...body, lines: [{ recipientCueAnexo: '180000200', items: [{ productId: 'p', quantity: 0 }] }] }]) {
      expect((await POST(post(value))).status).toBe(400)
    }
    expect(service.dispatchRemito).not.toHaveBeenCalled()
  })

  it('returns the hub denial without calling the service', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    vi.mocked(hubApiAccessResponse).mockResolvedValue(Response.json({ error: 'Unauthorized' }, { status: 401 }))
    expect((await POST(post(body))).status).toBe(401)
    expect(service.dispatchRemito).not.toHaveBeenCalled()
  })

  it('maps service errors to their status and exposes machine-readable details', async () => {
    const { BookletServiceError } = await import('@/lib/cuadernillos/inventory')
    const { RemitoDispatchError } = await import('@/lib/cuadernillos/remito-dispatch')
    service.dispatchRemito.mockRejectedValueOnce(new BookletServiceError('forbidden', 403))
    const forbidden = await POST(post(body))
    expect(forbidden.status).toBe(403)
    expect(await forbidden.json()).toEqual({ error: 'forbidden' })

    service.dispatchRemito.mockRejectedValueOnce(new RemitoDispatchError('recipients_not_critical', 409, { recipientCueAnexos: ['180000200'] }))
    const conflict = await POST(post(body))
    expect(conflict.status).toBe(409)
    expect(await conflict.json()).toEqual({ error: 'recipients_not_critical', recipientCueAnexos: ['180000200'] })

    service.dispatchRemito.mockRejectedValueOnce(new Error('boom'))
    const failed = await POST(post(body))
    expect(failed.status).toBe(503)
    expect(await failed.json()).toEqual({ error: 'remito_dispatch_failed' })
  })
})

describe('GET /api/cuadernillos/remitos', () => {
  it('lists with the session actor and parsed paging parameters', async () => {
    const response = await GET(new Request('http://localhost/api/cuadernillos/remitos?campaignId=campaign-1&limit=5&cursor=abc'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ remitos: [], hasMore: false, nextCursor: null })
    expect(service.listRemitosForPlanning).toHaveBeenCalledWith(expect.objectContaining({ id: 'session-user' }), { campaignId: 'campaign-1', cursor: 'abc', limit: 5 })
  })

  it('rejects unknown or repeated parameters and maps a forbidden actor to 403', async () => {
    expect((await GET(new Request('http://localhost/api/cuadernillos/remitos?x=1'))).status).toBe(400)
    expect((await GET(new Request('http://localhost/api/cuadernillos/remitos?campaignId=a&campaignId=b'))).status).toBe(400)
    const { BookletServiceError } = await import('@/lib/cuadernillos/inventory')
    service.listRemitosForPlanning.mockRejectedValueOnce(new BookletServiceError('forbidden', 403))
    expect((await GET(new Request('http://localhost/api/cuadernillos/remitos'))).status).toBe(403)
  })
})
