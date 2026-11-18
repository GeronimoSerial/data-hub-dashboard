import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Route from './route'
import { getSessionUser } from '@/lib/session'
import { hubApiAccessResponse } from '@/lib/hub-entry-server'

usarDbTemporal('cuadernillos-reserva-asignaciones-rutas-')

const service = vi.hoisted(() => ({ assignFromReserve: vi.fn() }))
vi.mock('@/lib/cuadernillos/ge-conexion', () => ({ prepararEsquemaGe: vi.fn(async () => ({})) }))
vi.mock('@/lib/session', () => ({ getSessionUser: vi.fn() }))
vi.mock('@/lib/hub-entry-server', () => ({ hubApiAccessResponse: vi.fn() }))
vi.mock('@/lib/cuadernillos/reserve', () => service)
vi.mock('@/lib/cuadernillos/remito-dispatch', async () => {
  const { BookletServiceError } = await import('@/lib/cuadernillos/inventory')
  class RemitoDispatchError extends BookletServiceError {
    readonly details: Record<string, string[]>
    constructor(code: string, status: number, details: Record<string, string[]>) { super(code, status); this.details = details }
  }
  return { RemitoDispatchError }
})

let POST: typeof Route.POST
beforeAll(async () => { POST = (await import('./route')).POST })

const assigned = { remitoId: 'rem-1', campaignId: 'campaign-1', recipientCueAnexo: '180000200', recipientName: 'Escuela A', dispatchedAt: '2026-11-18T10:00:00.000Z', items: [{ productId: 'p1', quantity: 20 }] }
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getSessionUser).mockResolvedValue({ id: 'cab', role: 'consulta', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [] })
  vi.mocked(hubApiAccessResponse).mockResolvedValue(null)
  service.assignFromReserve.mockResolvedValue(assigned)
})
const body = { campaignId: 'campaign-1', recipientCueAnexo: '180000200', items: [{ productId: 'p1', quantity: 20 }], idempotencyKey: 'key-1' }
const post = (value: unknown) => POST(new Request('http://localhost/api/cuadernillos/reserva/asignaciones', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) }))

describe('POST /api/cuadernillos/reserva/asignaciones', () => {
  it('assigns with the session actor and returns the 201 contract body', async () => {
    const response = await post(body)
    expect(response.status).toBe(201)
    expect(await response.json()).toEqual(assigned)
    expect(service.assignFromReserve).toHaveBeenCalledWith(expect.objectContaining({ id: 'cab' }), body)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('rejects caller-supplied authority fields and malformed bodies without calling the service', async () => {
    for (const value of [
      { ...body, actorId: 'attacker' }, { ...body, cabeceraCueAnexo: '180000100' }, { ...body, items: [] },
      { ...body, items: [{ productId: 'p', quantity: 0 }] }, { ...body, recipientCueAnexo: '18' }, { ...body, idempotencyKey: '' },
    ]) expect((await post(value)).status).toBe(400)
    expect((await POST(new Request('http://localhost/x', { method: 'POST', body: '{' }))).status).toBe(400)
    expect(service.assignFromReserve).not.toHaveBeenCalled()
  })

  it('returns the hub denial without calling the service', async () => {
    vi.mocked(hubApiAccessResponse).mockResolvedValueOnce(Response.json({ error: 'Unauthorized' }, { status: 401 }))
    expect((await post(body)).status).toBe(401)
    expect(service.assignFromReserve).not.toHaveBeenCalled()
  })

  it('maps service errors to their status and exposes machine-readable details', async () => {
    const { BookletServiceError } = await import('@/lib/cuadernillos/inventory')
    const { RemitoDispatchError } = await import('@/lib/cuadernillos/remito-dispatch')
    service.assignFromReserve.mockRejectedValueOnce(new BookletServiceError('forbidden', 403))
    expect(await (await post(body)).json()).toEqual({ error: 'forbidden' })
    service.assignFromReserve.mockRejectedValueOnce(new RemitoDispatchError('insufficient_reserve', 409, { productIds: ['p1'] }))
    const conflict = await post(body)
    expect(conflict.status).toBe(409)
    expect(await conflict.json()).toEqual({ error: 'insufficient_reserve', productIds: ['p1'], details: { productIds: ['p1'] } })
    service.assignFromReserve.mockRejectedValueOnce(new RemitoDispatchError('recipients_not_critical', 409, { recipientCueAnexos: ['180000200'] }))
    expect(await (await post(body)).json()).toEqual({ error: 'recipients_not_critical', recipientCueAnexos: ['180000200'], details: { recipientCueAnexos: ['180000200'] } })
    service.assignFromReserve.mockRejectedValueOnce(new Error('boom'))
    const failed = await post(body)
    expect(failed.status).toBe(503)
    expect(await failed.json()).toEqual({ error: 'reserva_assign_failed' })
  })
})
