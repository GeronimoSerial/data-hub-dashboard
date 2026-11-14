import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Route from './route'
import { listReceiptsForActor } from '@/lib/cuadernillos/remito-receipts'
import { BookletServiceError } from '@/lib/cuadernillos/inventory'
import { getSessionUser } from '@/lib/session'

vi.mock('@/lib/session', () => ({ getSessionUser: vi.fn() }))
vi.mock('@/lib/cuadernillos/remito-receipts', () => ({ listReceiptsForActor: vi.fn() }))

let GET: typeof Route.GET
beforeAll(async () => { GET = (await import('./route')).GET })
const school = { id: 'u-school', role: 'operador_establecimiento' as const, banned: false, nivelJurIds: [], accesoRecursos: 'todos' as const, recursoIds: [], cueAnexo: '1800002-00' }
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getSessionUser).mockResolvedValue(school)
  vi.mocked(listReceiptsForActor).mockResolvedValue({ kind: 'school', lines: [] })
})
const call = () => GET(new Request('http://localhost/api/cuadernillos/recepciones'))

describe('GET /api/cuadernillos/recepciones', () => {
  it('lets a school operator with a CUE through the real hub guard and lists for the session actor', async () => {
    const response = await call()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ kind: 'school', lines: [] })
    expect(listReceiptsForActor).toHaveBeenCalledWith(expect.objectContaining({ id: 'u-school' }))
  })
  it('blocks a school operator without a CUE at the hub guard', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ ...school, cueAnexo: null })
    expect((await call()).status).toBe(403)
    expect(listReceiptsForActor).not.toHaveBeenCalled()
  })
  it('answers 401 when anonymous', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    expect((await call()).status).toBe(401)
  })
  it('maps service errors to their HTTP status', async () => {
    vi.mocked(listReceiptsForActor).mockRejectedValue(new BookletServiceError('forbidden', 403))
    const response = await call()
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'forbidden' })
  })
})
