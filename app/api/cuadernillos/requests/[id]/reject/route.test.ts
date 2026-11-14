import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Route from './route'
import { rejectRequest } from '@/lib/cuadernillos/approvals'
import { getSessionUser } from '@/lib/session'
import { hubApiAccessResponse } from '@/lib/hub-entry-server'

usarDbTemporal('cuadernillos-reject-rutas-')

vi.mock('@/lib/session', () => ({ getSessionUser: vi.fn() }))
vi.mock('@/lib/hub-entry-server', () => ({ hubApiAccessResponse: vi.fn() }))
vi.mock('@/lib/cuadernillos/approvals', () => ({ rejectRequest: vi.fn() }))
let POST: typeof Route.POST
beforeAll(async () => { POST = (await import('./route')).POST })
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getSessionUser).mockResolvedValue({ id: 'supervisor-1', role: 'consulta', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [] })
  vi.mocked(hubApiAccessResponse).mockResolvedValue(null)
  vi.mocked(rejectRequest).mockResolvedValue({ requestId: 'r1', campaignId: 'c1', recipientCueAnexo: '180123457', recipientName: 'School', cabeceraCueAnexo: '180123456', status: 'rejected', lines: [], recommendations: [], submittedAt: null })
})
const request = (body: unknown) => new Request('http://localhost/api/cuadernillos/requests/r1/reject', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

describe('POST /api/cuadernillos/requests/[id]/reject', () => {
  it('requires an idempotency key and a reason and uses the authenticated actor', async () => {
    const invalid = await POST(request({ idempotencyKey: 'r1' }), { params: Promise.resolve({ id: 'r1' }) })
    expect(invalid.status).toBe(400)
    expect(rejectRequest).not.toHaveBeenCalled()
    const response = await POST(request({ idempotencyKey: 'r1', reason: 'Not approved' }), { params: Promise.resolve({ id: 'r1' }) })
    expect(response.status).toBe(200)
    expect(rejectRequest).toHaveBeenCalledWith(expect.objectContaining({ id: 'supervisor-1' }), { requestId: 'r1', idempotencyKey: 'r1', reason: 'Not approved' })
  })
})
