import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Route from './route'
import { getSessionUser } from '@/lib/session'
import { hubApiAccessResponse } from '@/lib/hub-entry-server'
import { grant, listMemberships, searchUsers } from '@/lib/cuadernillos/memberships'
import { BookletServiceError } from '@/lib/cuadernillos/inventory'

vi.mock('@/lib/session', () => ({ getSessionUser: vi.fn() }))
vi.mock('@/lib/hub-entry-server', () => ({ hubApiAccessResponse: vi.fn() }))
vi.mock('@/lib/cuadernillos/memberships', () => ({
  grant: vi.fn(), listMemberships: vi.fn(), searchUsers: vi.fn(),
}))

let GET: typeof Route.GET
let POST: typeof Route.POST
beforeAll(async () => { const route = await import('./route'); GET = route.GET; POST = route.POST })

const post = (body: unknown) => new Request('http://localhost/api/cuadernillos/memberships', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getSessionUser).mockResolvedValue({
    id: 'admin-1', role: 'admin', banned: false,
    nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [],
  })
  vi.mocked(hubApiAccessResponse).mockResolvedValue(null)
})

describe('memberships route', () => {
  it('grants with the session actor and returns 201 with no-store headers', async () => {
    vi.mocked(grant).mockResolvedValue({ id: 'm-1' } as never)

    const response = await POST(post({ userId: 'user-2', capability: 'cabecera' }))

    expect(response.status).toBe(201)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(grant).toHaveBeenCalledWith(expect.objectContaining({ id: 'admin-1' }), 'user-2', 'cabecera')
  })

  it('rejects bodies with unknown fields or capabilities before calling the service', async () => {
    expect((await POST(post({ userId: 'user-2', capability: 'admin', grantedByUserId: 'x' }))).status).toBe(400)
    expect(grant).not.toHaveBeenCalled()
  })

  it('maps a service refusal to its status and code', async () => {
    vi.mocked(grant).mockRejectedValue(new BookletServiceError('forbidden', 403))

    const response = await POST(post({ userId: 'user-2', capability: 'planning' }))

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'forbidden' })
  })

  it('searches users when q is present and lists memberships otherwise', async () => {
    vi.mocked(searchUsers).mockResolvedValue([])
    vi.mocked(listMemberships).mockResolvedValue([])

    await GET(new Request('http://localhost/api/cuadernillos/memberships?q=ana'))
    expect(searchUsers).toHaveBeenCalledWith(expect.objectContaining({ id: 'admin-1' }), 'ana')

    const listed = await GET(new Request('http://localhost/api/cuadernillos/memberships'))
    expect(listed.status).toBe(200)
    expect(await listed.json()).toEqual({ memberships: [] })
  })

  it('returns the hub denial unchanged when the session has no cuadernillos access', async () => {
    vi.mocked(hubApiAccessResponse).mockResolvedValue(Response.json({ error: 'hub' }, { status: 403 }))

    const response = await GET(new Request('http://localhost/api/cuadernillos/memberships'))

    expect(response.status).toBe(403)
    expect(listMemberships).not.toHaveBeenCalled()
  })
})
