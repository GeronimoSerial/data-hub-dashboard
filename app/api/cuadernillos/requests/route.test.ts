import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import type { SessionUser } from '@/lib/acl'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Route from './route'
import { createRequest } from '@/lib/cuadernillos/requests'
import { getSessionUser } from '@/lib/session'
import { hubApiAccessResponse } from '@/lib/hub-entry-server'
import { getBookletRequestPage } from '@/lib/cuadernillos/permissions'

usarDbTemporal('cuadernillos-requests-rutas-')

vi.mock('@/lib/session', () => ({ getSessionUser: vi.fn() }))
vi.mock('@/lib/hub-entry-server', () => ({ hubApiAccessResponse: vi.fn() }))
vi.mock('@/lib/cuadernillos/requests', () => ({ createRequest: vi.fn() }))
vi.mock('@/lib/cuadernillos/permissions', () => ({ getBookletRequestPage: vi.fn() }))

let POST: typeof Route.POST
let GET: typeof Route.GET
beforeAll(async () => { const route = await import('./route'); POST = route.POST; GET = route.GET })
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getSessionUser).mockResolvedValue({ id: 'session-user', role: 'consulta', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [] })
  vi.mocked(hubApiAccessResponse).mockResolvedValue(null)
  vi.mocked(createRequest).mockResolvedValue({
    requestId: 'req-1', campaignId: 'campaign-1', recipientCueAnexo: '180123457', recipientName: 'School',
    cabeceraCueAnexo: '180123456', status: 'pending', lines: [{ productId: 'product-1', quantity: 2 }],
    recommendations: [], submittedAt: '2026-11-09T00:00:00.000Z',
  })
  vi.mocked(getBookletRequestPage).mockResolvedValue({ campaignId: 'campaign-1', campaignOptions: [], requests: [], hasMore: false, nextCursor: null })
})

const request = () => new Request('http://localhost/api/cuadernillos/requests', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ anything: true }) })

describe('POST /api/cuadernillos/requests', () => {
  it('answers 410 flow_retired to an authorized caller and never calls the old service', async () => {
    const response = await POST(request())
    expect(response.status).toBe(410)
    expect(await response.json()).toEqual({ error: 'flow_retired', message: 'Booklet requests and quotas were replaced by remitos.' })
    expect(createRequest).not.toHaveBeenCalled()
  })

  it('keeps the hub guard: anonymous callers get the guard response', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    vi.mocked(hubApiAccessResponse).mockResolvedValue(Response.json({ error: 'Unauthorized' }, { status: 401 }))
    const response = await POST(request())
    expect(response.status).toBe(401)
    expect(createRequest).not.toHaveBeenCalled()
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

describe('removed view-as parameter on /api/cuadernillos/requests', () => {
  it('rejects viewAs on reads and never reads another account', async () => {
    const response = await GET(new Request('http://localhost/api/cuadernillos/requests?viewAs=target-2'))

    expect(response.status).toBe(400)
    expect(getBookletRequestPage).not.toHaveBeenCalled()
  })
})
