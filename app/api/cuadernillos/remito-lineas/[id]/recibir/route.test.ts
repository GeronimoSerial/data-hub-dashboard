import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Route from './route'
import { receiveRemitoLineAtSchool } from '@/lib/cuadernillos/remito-receipts'
import { BookletServiceError } from '@/lib/cuadernillos/inventory'
import { getSessionUser } from '@/lib/session'

usarDbTemporal('cuadernillos-remito-lineas-id-recibir-rutas-')

vi.mock('@/lib/session', () => ({ getSessionUser: vi.fn() }))
vi.mock('@/lib/cuadernillos/remito-receipts', () => ({ receiveRemitoLineAtSchool: vi.fn() }))

let POST: typeof Route.POST
beforeAll(async () => { POST = (await import('./route')).POST })
const school = { id: 'u-school', role: 'operador_establecimiento' as const, banned: false, nivelJurIds: [], accesoRecursos: 'todos' as const, recursoIds: [], cueAnexo: '1800002-00' }
const result = { lineId: 'l1', status: 'received' as const, signerUserId: 'u-school', receivedAt: '2026-11-14T00:00:00.000Z' }
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getSessionUser).mockResolvedValue(school)
  vi.mocked(receiveRemitoLineAtSchool).mockResolvedValue(result)
})
const body = { idempotencyKey: 'k1', items: [{ productId: 'p1', receivedQuantity: 3 }] }
const call = (value: unknown) => POST(
  new Request('http://localhost/api/cuadernillos/remito-lineas/l1/recibir', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) }),
  { params: Promise.resolve({ id: 'l1' }) },
)

describe('POST /api/cuadernillos/remito-lineas/[id]/recibir', () => {
  it('lets a school operator with a CUE through the real hub guard and sends only session actor, path id and body', async () => {
    const response = await call(body)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ receipt: result })
    expect(receiveRemitoLineAtSchool).toHaveBeenCalledWith(expect.objectContaining({ id: 'u-school' }), 'l1', body)
  })
  it('ignores identity: signer fields in the body are rejected', async () => {
    expect((await call({ ...body, signerUserId: 'attacker' })).status).toBe(400)
    expect(receiveRemitoLineAtSchool).not.toHaveBeenCalled()
  })
  it('blocks a school operator without a CUE at the hub guard', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ ...school, cueAnexo: null })
    expect((await call(body)).status).toBe(403)
    expect(receiveRemitoLineAtSchool).not.toHaveBeenCalled()
  })
  it('answers 401 when anonymous', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    expect((await call(body)).status).toBe(401)
  })
  it('maps service errors to their HTTP status', async () => {
    vi.mocked(receiveRemitoLineAtSchool).mockRejectedValue(new BookletServiceError('cabecera_receipt_pending', 409))
    const response = await call(body)
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'cabecera_receipt_pending' })
  })
})
