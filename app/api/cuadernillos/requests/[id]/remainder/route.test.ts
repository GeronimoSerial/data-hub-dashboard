import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Route from './route'
import { createRemainderRequest, getRequestChain } from '@/lib/cuadernillos/remainders'
import { getSessionUser } from '@/lib/session'
import { hubApiAccessResponse } from '@/lib/hub-entry-server'

usarDbTemporal('cuadernillos-remainder-rutas-')

vi.mock('@/lib/session', () => ({ getSessionUser: vi.fn() }))
vi.mock('@/lib/hub-entry-server', () => ({ hubApiAccessResponse: vi.fn() }))
vi.mock('@/lib/cuadernillos/remainders', () => ({ createRemainderRequest: vi.fn(), getRequestChain: vi.fn() }))
let GET: typeof Route.GET
let POST: typeof Route.POST
beforeAll(async () => { const route = await import('./route'); GET = route.GET; POST = route.POST })
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getSessionUser).mockResolvedValue({ id: 'cabecera-1', role: 'consulta', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [] })
  vi.mocked(hubApiAccessResponse).mockResolvedValue(null)
  vi.mocked(createRemainderRequest).mockResolvedValue({ requestId: 'child-1', campaignId: 'c1', recipientCueAnexo: '180123457', recipientName: 'School', cabeceraCueAnexo: '180123456', status: 'pending', lines: [{ productId: 'p1', quantity: 4 }], recommendations: [], submittedAt: '2026-11-09T00:00:00.000Z' })
  vi.mocked(getRequestChain).mockResolvedValue({ rootRequestId: 'root-1', requested: [{ productId: 'p1', quantity: 10 }], approved: [{ productId: 'p1', quantity: 6 }], remaining: [{ productId: 'p1', quantity: 4 }], availableRemainder: [{ productId: 'p1', quantity: 3 }] })
})
const request = () => new Request('http://localhost/api/cuadernillos/requests/root/remainder', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ anything: true }) })

describe('POST /api/cuadernillos/requests/[id]/remainder', () => {
  it('answers 410 flow_retired to an authorized caller and never calls the old service', async () => {
    const response = await POST(request(), { params: Promise.resolve({ id: 'root-1' }) })
    expect(response.status).toBe(410)
    expect(await response.json()).toEqual({ error: 'flow_retired', message: 'Booklet requests and quotas were replaced by remitos.' })
    expect(createRemainderRequest).not.toHaveBeenCalled()
  })
  it('keeps the hub guard: unauthorized callers get the guard response', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    vi.mocked(hubApiAccessResponse).mockResolvedValue(Response.json({ error: 'denied' }, { status: 403 }))
    const response = await POST(request(), { params: Promise.resolve({ id: 'root-1' }) })
    expect(response.status).toBe(403)
    expect(createRemainderRequest).not.toHaveBeenCalled()
  })
})

describe('GET /api/cuadernillos/requests/[id]/remainder', () => {
  it('returns only the account-scoped chain for the path request ID', async () => {
    const response = await GET(new Request('http://localhost/api/cuadernillos/requests/root-1/remainder'), { params: Promise.resolve({ id: 'root-1' }) })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ rootRequestId: 'root-1', availableRemainder: [{ productId: 'p1', quantity: 3 }] })
    expect(getRequestChain).toHaveBeenCalledWith(expect.objectContaining({ id: 'cabecera-1' }), 'root-1')
  })

  it('requires the authenticated session and hub access before reading the chain', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    vi.mocked(hubApiAccessResponse).mockResolvedValue(Response.json({ error: 'denied' }, { status: 403 }))
    const response = await GET(new Request('http://localhost/api/cuadernillos/requests/root-1/remainder'), { params: Promise.resolve({ id: 'root-1' }) })
    expect(response.status).toBe(403)
    expect(getRequestChain).not.toHaveBeenCalled()
  })
})
