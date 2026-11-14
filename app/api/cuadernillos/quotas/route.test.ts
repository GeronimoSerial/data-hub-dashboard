import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Route from './route'
import { setQuota } from '@/lib/cuadernillos/inventory'
import { getSessionUser } from '@/lib/session'
import { hubApiAccessResponse } from '@/lib/hub-entry-server'

vi.mock('@/lib/session', () => ({ getSessionUser: vi.fn() }))
vi.mock('@/lib/hub-entry-server', () => ({ hubApiAccessResponse: vi.fn() }))
vi.mock('@/lib/cuadernillos/inventory', () => ({ setQuota: vi.fn() }))

let POST: typeof Route.POST
beforeAll(async () => { POST = (await import('./route')).POST })
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getSessionUser).mockResolvedValue({ id: 'user-1', role: 'consulta', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [] })
  vi.mocked(hubApiAccessResponse).mockResolvedValue(null)
})
const request = () => new Request('http://localhost/api/cuadernillos/quotas', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ anything: true }) })

describe('POST /api/cuadernillos/quotas', () => {
  it('answers 410 flow_retired to an authorized caller and never calls the old service', async () => {
    const response = await POST(request())
    expect(response.status).toBe(410)
    expect(await response.json()).toEqual({ error: 'flow_retired', message: 'Booklet requests and quotas were replaced by remitos.' })
    expect(setQuota).not.toHaveBeenCalled()
  })
  it('keeps the hub guard: anonymous callers get the guard response', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    vi.mocked(hubApiAccessResponse).mockResolvedValue(Response.json({ error: 'Unauthorized' }, { status: 401 }))
    const response = await POST(request())
    expect(response.status).toBe(401)
    expect(setQuota).not.toHaveBeenCalled()
  })
})
