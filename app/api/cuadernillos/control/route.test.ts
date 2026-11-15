import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Route from './route'
import { BookletServiceError } from '@/lib/cuadernillos/inventory'
import { getSupervisorControl } from '@/lib/cuadernillos/remito-control'
import { getSessionUser } from '@/lib/session'
import { hubApiAccessResponse } from '@/lib/hub-entry-server'

vi.mock('@/lib/session', () => ({ getSessionUser: vi.fn() }))
vi.mock('@/lib/hub-entry-server', () => ({ hubApiAccessResponse: vi.fn() }))
vi.mock('@/lib/cuadernillos/remito-control', () => ({ getSupervisorControl: vi.fn() }))

let GET: typeof Route.GET
beforeAll(async () => { GET = (await import('./route')).GET })
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getSessionUser).mockResolvedValue({ id: 'sup-1', role: 'consulta', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [] })
  vi.mocked(hubApiAccessResponse).mockResolvedValue(null)
  vi.mocked(getSupervisorControl).mockResolvedValue({
    summary: { remitosPendingCabeceraReceipt: 0, linesPendingSchoolReceipt: 0, planningToCabeceraShortfallUnits: 0, cabeceraToSchoolShortfallUnits: 0 },
    remitos: [], hasMore: false, nextCursor: null,
  })
})
const get = (query = '') => GET(new Request(`http://localhost/api/cuadernillos/control${query}`))

describe('GET /api/cuadernillos/control', () => {
  it('passes the session actor and parsed filters to the service', async () => {
    const response = await get('?campaignId=c1&onlyWithShortfall=true&cursor=abc&limit=20')
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(getSupervisorControl).toHaveBeenCalledWith(expect.objectContaining({ id: 'sup-1' }),
      { campaignId: 'c1', onlyWithShortfall: true, cursor: 'abc', limit: 20 })
    expect(await response.json()).toMatchObject({ remitos: [], hasMore: false })
  })

  it('defaults onlyWithShortfall to false', async () => {
    await get()
    expect(getSupervisorControl).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ onlyWithShortfall: false }))
  })

  it('rejects unknown, repeated and malformed parameters', async () => {
    for (const query of ['?actorId=x', '?campaignId=a&campaignId=b', '?onlyWithShortfall=yes', '?limit=abc']) {
      expect((await get(query)).status).toBe(400)
    }
    expect(getSupervisorControl).not.toHaveBeenCalled()
  })

  it('returns the hub denial without calling the service', async () => {
    vi.mocked(hubApiAccessResponse).mockResolvedValue(Response.json({ error: 'Unauthorized' }, { status: 401 }))
    expect((await get()).status).toBe(401)
    expect(getSupervisorControl).not.toHaveBeenCalled()
  })

  it('maps service errors to their status and unknown failures to 503', async () => {
    vi.mocked(getSupervisorControl).mockRejectedValueOnce(new BookletServiceError('forbidden', 403))
    const denied = await get()
    expect(denied.status).toBe(403)
    expect(await denied.json()).toEqual({ error: 'forbidden' })
    vi.mocked(getSupervisorControl).mockRejectedValueOnce(new Error('db down'))
    expect((await get()).status).toBe(503)
  })
})
