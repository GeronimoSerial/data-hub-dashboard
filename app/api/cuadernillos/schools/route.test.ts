import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Route from './route'
import type { SessionUser } from '@/lib/acl'
import { getSessionUser } from '@/lib/session'
import { hasBookletCapability } from '@/lib/cuadernillos/permissions'
import { searchCriticalConsejoSchools } from '@/lib/cuadernillos/eligibility'

vi.mock('@/lib/session', () => ({ getSessionUser: vi.fn() }))
vi.mock('@/lib/cuadernillos/permissions', () => ({ hasBookletCapability: vi.fn() }))
vi.mock('@/lib/cuadernillos/eligibility', () => ({ searchCriticalConsejoSchools: vi.fn() }))

let GET: typeof Route.GET
beforeAll(async () => { GET = (await import('./route')).GET })

const cabecera: SessionUser = {
  id: 'cabecera-1', role: 'consulta', banned: false,
  nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [],
  hubPolicy: { enabledSections: ['cuadernillos'], landing: false },
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getSessionUser).mockResolvedValue(cabecera)
  vi.mocked(hasBookletCapability).mockResolvedValue(true)
  vi.mocked(searchCriticalConsejoSchools).mockResolvedValue([
    { cueAnexo: '180000100', nombre: 'ESCUELA UNO', departamento: 'BELLA VISTA', severity: 'Crítica' },
  ])
})

function request(query: string) {
  return new Request(`http://localhost/api/cuadernillos/schools?${query}`)
}

describe('GET /api/cuadernillos/schools', () => {
  it('requires a session and never searches for anonymous requests', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)

    const response = await GET(request('cue=18000'))

    expect(response.status).toBe(401)
    expect(searchCriticalConsejoSchools).not.toHaveBeenCalled()
  })

  it('returns only the critical schools the search reports, with the no-store header', async () => {
    const response = await GET(request('cue=18000'))

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await response.json()).toEqual({
      schools: [{ cueAnexo: '180000100', nombre: 'ESCUELA UNO', departamento: 'BELLA VISTA', severity: 'Crítica' }],
    })
    expect(searchCriticalConsejoSchools).toHaveBeenCalledWith('18000')
  })

  it('rejects short, non-numeric or repeated cue parameters before searching', async () => {
    for (const query of ['cue=18', 'cue=18000a', 'cue=1800000000', 'cue=18000&cue=18001', '']) {
      const response = await GET(request(query))
      expect(response.status).toBe(400)
    }
    expect(searchCriticalConsejoSchools).not.toHaveBeenCalled()
  })

  it('denies actors without cabecera capability, admin included only through the capability check', async () => {
    vi.mocked(hasBookletCapability).mockResolvedValue(false)

    const response = await GET(request('cue=18000'))

    expect(response.status).toBe(403)
    expect(searchCriticalConsejoSchools).not.toHaveBeenCalled()
  })

  it('allows planning accounts that lack the cabecera capability', async () => {
    vi.mocked(hasBookletCapability).mockImplementation(async (_actor, capability) => capability === 'planning')

    const response = await GET(request('cue=18000'))

    expect(response.status).toBe(200)
    expect(searchCriticalConsejoSchools).toHaveBeenCalledWith('18000')
  })

  it('still denies accounts holding only the supervisor capability', async () => {
    vi.mocked(hasBookletCapability).mockImplementation(async (_actor, capability) => capability === 'supervisor')

    const response = await GET(request('cue=18000'))

    expect(response.status).toBe(403)
    expect(searchCriticalConsejoSchools).not.toHaveBeenCalled()
  })

  it('reports a read failure without leaking details', async () => {
    vi.mocked(searchCriticalConsejoSchools).mockRejectedValue(new Error('db down'))

    const response = await GET(request('cue=18000'))

    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('db down')
  })
})
