import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Route from './route'
import { getSessionUser } from '@/lib/session'
import { hubApiAccessResponse } from '@/lib/hub-entry-server'

usarDbTemporal('cuadernillos-reserva-rutas-')

const service = vi.hoisted(() => ({ getReserveSummary: vi.fn() }))
vi.mock('@/lib/session', () => ({ getSessionUser: vi.fn() }))
vi.mock('@/lib/hub-entry-server', () => ({ hubApiAccessResponse: vi.fn() }))
vi.mock('@/lib/cuadernillos/reserve', () => service)

let GET: typeof Route.GET
beforeAll(async () => { GET = (await import('./route')).GET })

const summary = { campaignId: 'campaign-1', cabeceraCueAnexo: '180000100', balances: [], assignments: [] }
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getSessionUser).mockResolvedValue({ id: 'cab', role: 'consulta', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [] })
  vi.mocked(hubApiAccessResponse).mockResolvedValue(null)
  service.getReserveSummary.mockResolvedValue(summary)
})
const get = (query: string) => GET(new Request(`http://localhost/api/cuadernillos/reserva${query}`))

describe('GET /api/cuadernillos/reserva', () => {
  it('returns the cabecera reserve of the session actor with no-store headers', async () => {
    const response = await get('?campaignId=campaign-1')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(summary)
    expect(service.getReserveSummary).toHaveBeenCalledWith(expect.objectContaining({ id: 'cab' }), 'campaign-1')
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('requires exactly one campaignId and rejects unknown parameters', async () => {
    for (const query of ['', '?campaignId=', '?campaignId=a&campaignId=b', '?campaignId=a&x=1']) expect((await get(query)).status).toBe(400)
    expect(service.getReserveSummary).not.toHaveBeenCalled()
  })

  it('returns the hub denial and maps service errors', async () => {
    vi.mocked(hubApiAccessResponse).mockResolvedValueOnce(Response.json({ error: 'Unauthorized' }, { status: 401 }))
    expect((await get('?campaignId=a')).status).toBe(401)
    const { BookletServiceError } = await import('@/lib/cuadernillos/inventory')
    service.getReserveSummary.mockRejectedValueOnce(new BookletServiceError('forbidden', 403))
    const forbidden = await get('?campaignId=a')
    expect(forbidden.status).toBe(403)
    expect(await forbidden.json()).toEqual({ error: 'forbidden' })
    service.getReserveSummary.mockRejectedValueOnce(new Error('boom'))
    const failed = await get('?campaignId=a')
    expect(failed.status).toBe(503)
    expect(await failed.json()).toEqual({ error: 'reserva_read_failed' })
  })
})
