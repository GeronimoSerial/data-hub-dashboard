import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Route from './route'
import { getBookletOverviewPage } from '@/lib/cuadernillos/queries'
import { BookletRequestReadError } from '@/lib/cuadernillos/permissions'
import { getSessionUser } from '@/lib/session'
import { hubApiAccessResponse } from '@/lib/hub-entry-server'

vi.mock('@/lib/session', () => ({ getSessionUser: vi.fn() }))
vi.mock('@/lib/hub-entry-server', () => ({ hubApiAccessResponse: vi.fn() }))
vi.mock('@/lib/cuadernillos/queries', () => ({ getBookletOverviewPage: vi.fn() }))
vi.mock('@/lib/cuadernillos/permissions', () => ({ BookletRequestReadError: class BookletRequestReadError extends Error { code: string; status: number; constructor(code: string, status: number) { super(code); this.code = code; this.status = status } } }))

let GET: typeof Route.GET
beforeAll(async () => { GET = (await import('./route')).GET })
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getSessionUser).mockResolvedValue({
    id: 'planner-1', role: 'consulta', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [],
    hubPolicy: { enabledSections: ['cuadernillos'], landing: false },
  })
  vi.mocked(hubApiAccessResponse).mockResolvedValue(null)
  vi.mocked(getBookletOverviewPage).mockResolvedValue({
    capability: 'planning', campaignId: 'campaign-1', campaignOptions: [], balances: [], requests: [],
    eligibility: null, hasMore: false, nextCursor: null,
  })
})

function request(query = 'capability=planning') {
  return new Request(`http://localhost/api/cuadernillos/overview?${query}`)
}

describe('GET /api/cuadernillos/overview', () => {
  it('rejects anonymous access before querying overview data', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    vi.mocked(hubApiAccessResponse).mockResolvedValue(Response.json({ error: 'Unauthorized' }, { status: 401 }))

    const response = await GET(request())

    expect(response.status).toBe(401)
    expect(getBookletOverviewPage).not.toHaveBeenCalled()
  })

  it('rejects caller-supplied identity, school scope, unknown or duplicate parameters', async () => {
    for (const query of [
      'capability=planning&actorId=other',
      'capability=planning&cueAnexo=180000000',
      'capability=invalid',
      'capability=planning&capability=supervisor',
      'capability=planning&campaignId=a&campaignId=b',
      'capability=planning&cursor=opaque',
      'capability=planning&unexpected=1',
    ]) {
      expect((await GET(request(query))).status).toBe(400)
    }
    expect(getBookletOverviewPage).not.toHaveBeenCalled()
  })

  it('requires the hub section before invoking the capability-scoped query', async () => {
    vi.mocked(hubApiAccessResponse).mockResolvedValue(Response.json({ error: 'No tiene acceso' }, { status: 403 }))

    const response = await GET(request())

    expect(response.status).toBe(403)
    expect(getBookletOverviewPage).not.toHaveBeenCalled()
  })

  it('uses only server session identity and returns private account-scoped data', async () => {
    vi.mocked(getBookletOverviewPage).mockResolvedValue({
      capability: 'cabecera', campaignId: 'campaign-1', campaignOptions: [], balances: [], requests: [],
      eligibility: null, hasMore: false, nextCursor: null,
    })
    const response = await GET(request('capability=cabecera&campaignId=campaign-1'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(getBookletOverviewPage).toHaveBeenCalledWith(expect.objectContaining({ id: 'planner-1' }), 'cabecera', {
      campaignId: 'campaign-1',
    })
    expect(body.capability).toBe('cabecera')
  })

  it('preserves service error status without exposing raw error details', async () => {
    vi.mocked(getBookletOverviewPage).mockRejectedValue(new BookletRequestReadError('campaign_not_found', 404))

    const response = await GET(request('capability=planning&campaignId=unknown'))

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'campaign_not_found' })
  })
})

describe('removed view-as parameter on /api/cuadernillos/overview', () => {
  it('rejects viewAs on reads and never reads another account', async () => {
    const response = await GET(request('capability=cabecera&viewAs=target-2'))

    expect(response.status).toBe(400)
    expect(getBookletOverviewPage).not.toHaveBeenCalled()
  })
})
