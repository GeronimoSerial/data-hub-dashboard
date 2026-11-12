import type { SessionUser } from '@/lib/acl'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Route from './route'
import { createRequest } from '@/lib/cuadernillos/requests'
import { getSessionUser } from '@/lib/session'
import { hubApiAccessResponse } from '@/lib/hub-entry-server'
import { getBookletRequestPage } from '@/lib/cuadernillos/permissions'
import { resolveViewAsActor } from '@/lib/cuadernillos/view-as'

vi.mock('@/lib/session', () => ({ getSessionUser: vi.fn() }))
vi.mock('@/lib/hub-entry-server', () => ({ hubApiAccessResponse: vi.fn() }))
vi.mock('@/lib/cuadernillos/view-as', () => ({ resolveViewAsActor: vi.fn() }))
vi.mock('@/lib/cuadernillos/requests', () => ({ createRequest: vi.fn() }))
vi.mock('@/lib/cuadernillos/permissions', () => ({ getBookletRequestPage: vi.fn() }))

let POST: typeof Route.POST
let GET: typeof Route.GET
beforeAll(async () => { const route = await import('./route'); POST = route.POST; GET = route.GET })
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(resolveViewAsActor).mockImplementation(async (actor) => ({ status: 'self', actor }))
  vi.mocked(getSessionUser).mockResolvedValue({ id: 'session-user', role: 'consulta', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [] })
  vi.mocked(hubApiAccessResponse).mockResolvedValue(null)
  vi.mocked(createRequest).mockResolvedValue({
    requestId: 'req-1', campaignId: 'campaign-1', recipientCueAnexo: '180123457', recipientName: 'School',
    cabeceraCueAnexo: '180123456', status: 'pending', lines: [{ productId: 'product-1', quantity: 2 }],
    recommendations: [], submittedAt: '2026-11-09T00:00:00.000Z',
  })
  vi.mocked(getBookletRequestPage).mockResolvedValue({ campaignId: 'campaign-1', campaignOptions: [], requests: [], hasMore: false, nextCursor: null })
})

const body = { campaignId: 'campaign-1', recipientCueAnexo: '180123457', lines: [{ productId: 'product-1', quantity: 2 }], submit: true, idempotencyKey: 'request-1' }
const request = (value: unknown) => new Request('http://localhost/api/cuadernillos/requests', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) })

describe('POST /api/cuadernillos/requests', () => {
  it('uses the authenticated actor and rejects caller-supplied authority fields', async () => {
    const response = await POST(request({ ...body, actorId: 'attacker' }))
    expect(response.status).toBe(400)
    expect(createRequest).not.toHaveBeenCalled()
  })

  it('forwards the optional cabecera scope and still rejects an invalid one', async () => {
    const scoped = { ...body, cabeceraCueAnexo: '180123456' }
    const response = await POST(request(scoped))
    expect(response.status).toBe(201)
    expect(createRequest).toHaveBeenCalledWith(expect.objectContaining({ id: 'session-user' }), scoped)

    const invalid = await POST(request({ ...body, cabeceraCueAnexo: '18012' }))
    expect(invalid.status).toBe(400)
  })

  it('requires an authenticated session before creating a request', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    vi.mocked(hubApiAccessResponse).mockResolvedValue(Response.json({ error: 'Unauthorized' }, { status: 401 }))
    const response = await POST(request(body))
    expect(response.status).toBe(401)
    expect(createRequest).not.toHaveBeenCalled()
  })

  it('passes session identity and strict request input to the service', async () => {
    const response = await POST(request(body))
    expect(response.status).toBe(201)
    expect(createRequest).toHaveBeenCalledWith(expect.objectContaining({ id: 'session-user' }), body)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  })
})

describe('GET /api/cuadernillos/requests', () => {
  it('rejects guessed actor, school, or capability query parameters', async () => {
    for (const query of ['actorId=other', 'cueAnexo=180123456', 'capability=planning']) {
      const response = await GET(new Request(`http://localhost/api/cuadernillos/requests?${query}`))
      expect(response.status).toBe(400)
    }
    expect(getBookletRequestPage).not.toHaveBeenCalled()
  })

  it('requires an authenticated session before reading requests', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    vi.mocked(hubApiAccessResponse).mockResolvedValue(Response.json({ error: 'Unauthorized' }, { status: 401 }))
    const response = await GET(new Request('http://localhost/api/cuadernillos/requests'))
    expect(response.status).toBe(401)
    expect(getBookletRequestPage).not.toHaveBeenCalled()
  })

  it('uses session scope and validated cursor parameters for the request page', async () => {
    const response = await GET(new Request('http://localhost/api/cuadernillos/requests?campaignId=campaign-1&cursor=opaque&limit=20'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ campaignId: 'campaign-1', campaignOptions: [], requests: [], hasMore: false, nextCursor: null })
    expect(getBookletRequestPage).toHaveBeenCalledWith(expect.objectContaining({ id: 'session-user' }), {
      campaignId: 'campaign-1', cursor: 'opaque', limit: 20,
    })
  })
})

describe('view-as on /api/cuadernillos/requests', () => {
  const target: SessionUser = { id: 'target-2', role: 'consulta', banned: false, nivelJurIds: [], accesoRecursos: 'seleccionados', recursoIds: [] }

  it('reads the request list as the resolved target account', async () => {
    vi.mocked(resolveViewAsActor).mockResolvedValue({ status: 'viewing', actor: target, target: { userId: 'target-2', name: 'Supervisora' } })

    const response = await GET(new Request('http://localhost/api/cuadernillos/requests?viewAs=target-2'))

    expect(response.status).toBe(200)
    expect(getBookletRequestPage).toHaveBeenCalledWith(target, expect.objectContaining({ limit: undefined }))
  })

  it('answers 403 for an account that cannot be viewed', async () => {
    vi.mocked(resolveViewAsActor).mockResolvedValue({ status: 'unavailable' })

    expect((await GET(new Request('http://localhost/api/cuadernillos/requests?viewAs=banned-1'))).status).toBe(403)
    expect(getBookletRequestPage).not.toHaveBeenCalled()
  })

  it('never applies viewAs to a request creation', async () => {
    vi.mocked(resolveViewAsActor).mockResolvedValue({ status: 'viewing', actor: target, target: { userId: 'target-2', name: 'Supervisora' } })

    const response = await POST(new Request('http://localhost/api/cuadernillos/requests?viewAs=target-2', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }))

    expect(response.status).toBe(201)
    expect(resolveViewAsActor).not.toHaveBeenCalled()
    expect(createRequest).toHaveBeenCalledWith(expect.objectContaining({ id: 'session-user' }), body)
  })
})
