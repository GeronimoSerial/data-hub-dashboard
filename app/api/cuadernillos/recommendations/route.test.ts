import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Route from './route'
import { getSessionUser } from '@/lib/session'
import { canAccessSchool } from '@/lib/cuadernillos/permissions'
import { getEnrollmentRecommendations } from '@/lib/cuadernillos/enrollment'

const mocks = vi.hoisted(() => ({
  order: [] as string[],
}))

vi.mock('@/lib/session', () => ({ getSessionUser: vi.fn() }))
vi.mock('@/lib/cuadernillos/permissions', () => ({ canAccessSchool: vi.fn() }))
vi.mock('@/lib/cuadernillos/enrollment', () => ({ getEnrollmentRecommendations: vi.fn() }))

let GET: typeof Route.GET
beforeAll(async () => { GET = (await import('./route')).GET })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.order.length = 0
  vi.mocked(getSessionUser).mockResolvedValue({
    id: 'cabecera-1', role: 'consulta', banned: false,
    nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [],
    hubPolicy: { enabledSections: ['cuadernillos'], landing: false },
  })
  vi.mocked(canAccessSchool).mockImplementation(async () => {
    mocks.order.push('permission')
    return true
  })
  vi.mocked(getEnrollmentRecommendations).mockImplementation(async () => {
    mocks.order.push('recommendations')
    return [
      { productId: 'product-1', students: 27, suggested: 27, sourceCutId: 'cut-12' },
      { productId: 'product-2', students: null, suggested: null, sourceCutId: null },
    ]
  })
})

function request(query = 'cueAnexo=180123457&cabeceraCueAnexo=180123456&campaignId=campaign-1') {
  return new Request(`http://localhost/api/cuadernillos/recommendations?${query}`)
}

describe('GET /api/cuadernillos/recommendations', () => {
  it('requires a session and never calls the recommendation reader for anonymous requests', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)

    const response = await GET(request())

    expect(response.status).toBe(401)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(canAccessSchool).not.toHaveBeenCalled()
    expect(getEnrollmentRecommendations).not.toHaveBeenCalled()
  })

  it('denies an unassigned school without revealing whether it has enrollment data', async () => {
    vi.mocked(canAccessSchool).mockImplementation(async () => {
      mocks.order.push('permission')
      return false
    })

    const response = await GET(request())
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body).toEqual({ error: 'No tiene acceso a este recurso' })
    expect(canAccessSchool).toHaveBeenCalledWith(expect.objectContaining({ id: 'cabecera-1' }), '180123456', 'cabecera')
    expect(getEnrollmentRecommendations).not.toHaveBeenCalled()
    expect(JSON.stringify(body)).not.toMatch(/student|alumno|dni|nombre/i)
  })

  it('also requires the dedicated hub section before checking module assignment', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({
      id: 'cabecera-1', role: 'consulta', banned: false,
      nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [],
      hubPolicy: { enabledSections: ['maps'], landing: false },
    })

    const response = await GET(request())

    expect(response.status).toBe(403)
    expect(canAccessSchool).not.toHaveBeenCalled()
    expect(getEnrollmentRecommendations).not.toHaveBeenCalled()
  })

  it('validates CUE and campaign parameters before querying permissions or enrollment', async () => {
    for (const query of [
      'cueAnexo=18012345&campaignId=campaign-1',
      'cueAnexo=180123456',
      'cueAnexo=180123457&campaignId=campaign-1',
      'cueAnexo=180123457&cabeceraCueAnexo=180123456&campaignId=',
      'cueAnexo=180123457&cueAnexo=180123458&cabeceraCueAnexo=180123456&campaignId=campaign-1',
    ]) {
      const response = await GET(request(query))
      expect(response.status).toBe(400)
    }

    expect(canAccessSchool).not.toHaveBeenCalled()
    expect(getEnrollmentRecommendations).not.toHaveBeenCalled()
  })

  it('returns only aggregated recommendations after account-bound school authorization', async () => {
    const response = await GET(request())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(body).toEqual({
      recommendations: [
        { productId: 'product-1', students: 27, suggested: 27, sourceCutId: 'cut-12' },
        { productId: 'product-2', students: null, suggested: null, sourceCutId: null },
      ],
    })
    expect(mocks.order).toEqual(['permission', 'recommendations'])
    expect(canAccessSchool).toHaveBeenCalledWith(expect.objectContaining({ id: 'cabecera-1' }), '180123456', 'cabecera')
    expect(getEnrollmentRecommendations).toHaveBeenCalledWith('180123457', 'campaign-1')
    expect(JSON.stringify(body)).not.toMatch(/studentId|nombreAlumno|apellidoAlumno|dni|email|phone/i)
  })

  it('authorizes the requesting cabecera cue, not the recipient school, which needs no assignment', async () => {
    vi.mocked(canAccessSchool).mockImplementation(async (_actor, cue) => cue === '180123456')

    const response = await GET(request('cueAnexo=180999999&cabeceraCueAnexo=180123456&campaignId=campaign-1'))

    expect(response.status).toBe(200)
    expect(canAccessSchool).toHaveBeenCalledTimes(1)
    expect(canAccessSchool).toHaveBeenCalledWith(expect.objectContaining({ id: 'cabecera-1' }), '180123456', 'cabecera')
    expect(getEnrollmentRecommendations).toHaveBeenCalledWith('180999999', 'campaign-1')
  })

  it('does not expose reader failures and marks the response private', async () => {
    vi.mocked(getEnrollmentRecommendations).mockRejectedValue(new Error('sensitive database detail'))

    const response = await GET(request())
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(body).toEqual({ error: 'No se pudieron obtener las recomendaciones' })
    expect(JSON.stringify(body)).not.toContain('sensitive database detail')
  })
})
