import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Route from './route'
import { receiveRemitoAtCabecera } from '@/lib/cuadernillos/remito-receipts'
import { BookletServiceError } from '@/lib/cuadernillos/inventory'
import { getSessionUser } from '@/lib/session'
import { hubApiAccessResponse } from '@/lib/hub-entry-server'

usarDbTemporal('cuadernillos-remitos-id-recibir-rutas-')

vi.mock('@/lib/session', () => ({ getSessionUser: vi.fn() }))
vi.mock('@/lib/hub-entry-server', () => ({ hubApiAccessResponse: vi.fn() }))
vi.mock('@/lib/cuadernillos/remito-receipts', () => ({ receiveRemitoAtCabecera: vi.fn() }))

let POST: typeof Route.POST
beforeAll(async () => { POST = (await import('./route')).POST })
const result = { remitoId: 'r1', status: 'received' as const, signerUserId: 'u-cab', receivedAt: '2026-11-14T00:00:00.000Z', lines: [] }
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getSessionUser).mockResolvedValue({ id: 'u-cab', role: 'consulta', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [] })
  vi.mocked(hubApiAccessResponse).mockResolvedValue(null)
  vi.mocked(receiveRemitoAtCabecera).mockResolvedValue(result)
})
const body = { idempotencyKey: 'k1', lines: [{ lineId: 'l1', items: [{ productId: 'p1', receivedQuantity: 3 }], shortfallReason: 'faltaron' }] }
const call = (value: unknown) => POST(
  new Request('http://localhost/api/cuadernillos/remitos/r1/recibir', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) }),
  { params: Promise.resolve({ id: 'r1' }) },
)

describe('POST /api/cuadernillos/remitos/[id]/recibir', () => {
  it('sends only the session actor, path id and body to the service, behind the /cuadernillos guard', async () => {
    const response = await call(body)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ receipt: result })
    expect(hubApiAccessResponse).toHaveBeenCalledWith(expect.objectContaining({ id: 'u-cab' }), '/cuadernillos')
    expect(receiveRemitoAtCabecera).toHaveBeenCalledWith(expect.objectContaining({ id: 'u-cab' }), 'r1', body)
  })
  it('rejects identity fields and malformed bodies before the service', async () => {
    expect((await call({ ...body, signerUserId: 'attacker' })).status).toBe(400)
    expect((await call({ idempotencyKey: 'k', lines: [] })).status).toBe(400)
    expect(receiveRemitoAtCabecera).not.toHaveBeenCalled()
  })
  it('denies anonymous actors', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    vi.mocked(hubApiAccessResponse).mockResolvedValue(Response.json({ error: 'x' }, { status: 401 }))
    expect((await call(body)).status).toBe(401)
    expect(receiveRemitoAtCabecera).not.toHaveBeenCalled()
  })
  it('maps service errors to their HTTP status', async () => {
    vi.mocked(receiveRemitoAtCabecera).mockRejectedValue(new BookletServiceError('already_received', 409))
    const response = await call(body)
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'already_received' })
  })
})
