import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Route from './route'
import { approveRequest } from '@/lib/cuadernillos/approvals'
import { getSessionUser } from '@/lib/session'
import { hubApiAccessResponse } from '@/lib/hub-entry-server'

usarDbTemporal('cuadernillos-approve-rutas-')

vi.mock('@/lib/session', () => ({ getSessionUser: vi.fn() }))
vi.mock('@/lib/hub-entry-server', () => ({ hubApiAccessResponse: vi.fn() }))
vi.mock('@/lib/cuadernillos/approvals', () => ({ approveRequest: vi.fn() }))

let POST: typeof Route.POST
beforeAll(async () => { POST = (await import('./route')).POST })
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getSessionUser).mockResolvedValue({ id: 'verified-supervisor', role: 'consulta', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [] })
  vi.mocked(hubApiAccessResponse).mockResolvedValue(null)
  vi.mocked(approveRequest).mockResolvedValue({ requestId: 'r1', status: 'approved', approved: [{ productId: 'p1', quantity: 2 }], remaining: [], signerUserId: 'verified-supervisor', approvedAt: '2026-11-09T00:00:00.000Z' })
})
const body = { lines: [{ productId: 'p1', quantity: 2 }], idempotencyKey: 'a1' }
const request = (value: unknown) => new Request('http://localhost/api/cuadernillos/requests/r1/approve', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) })

describe('POST /api/cuadernillos/requests/[id]/approve', () => {
  it('takes signer identity from the session and rejects identity fields in the body', async () => {
    const response = await POST(request({ ...body, signerUserId: 'attacker' }), { params: Promise.resolve({ id: 'r1' }) })
    expect(response.status).toBe(400)
    expect(approveRequest).not.toHaveBeenCalled()
  })
  it('sends only the session actor and path ID to the atomic service', async () => {
    const response = await POST(request(body), { params: Promise.resolve({ id: 'r1' }) })
    expect(response.status).toBe(200)
    expect(approveRequest).toHaveBeenCalledWith(expect.objectContaining({ id: 'verified-supervisor' }), { requestId: 'r1', ...body })
  })
  it('denies anonymous actors before calling the service', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    vi.mocked(hubApiAccessResponse).mockResolvedValue(Response.json({ error: 'Unauthorized' }, { status: 401 }))
    const response = await POST(request(body), { params: Promise.resolve({ id: 'r1' }) })
    expect(response.status).toBe(401)
    expect(approveRequest).not.toHaveBeenCalled()
  })
})
