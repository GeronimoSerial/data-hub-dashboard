import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from './route'
import { getSessionUser } from '@/lib/session'
import { ensureSeeded } from '@/lib/db/seed'
import { loadRecursoAccessByRuta } from '@/lib/db/recurso-access'
import type { SessionUser } from '@/lib/acl'

vi.mock('@/lib/session', () => ({ getSessionUser: vi.fn() }))
vi.mock('@/lib/db/seed', () => ({ ensureSeeded: vi.fn() }))
vi.mock('@/lib/db/recurso-access', () => ({
  loadRecursoAccessByRuta: vi.fn(),
}))

const admin: SessionUser = {
  id: 'u-admin',
  role: 'admin',
  banned: false,
  nivelIds: [],
}

const consulta: SessionUser = {
  id: 'u-consulta',
  role: 'consulta',
  banned: false,
  nivelIds: [],
}

const OPEN = {
  estado: 'publicado' as const,
  audienciaNivelIds: [],
  audienciaUserIds: [],
}

const BORRADOR = {
  estado: 'borrador' as const,
  audienciaNivelIds: [],
  audienciaUserIds: [],
}

function request(path: string, search = '') {
  return new Request(`http://localhost:3000/api/gate${path}${search}`)
}

function ctx(segments: string[]) {
  return { params: Promise.resolve({ path: segments }) }
}

function location(res: Response) {
  const value = res.headers.get('location')
  if (!value) throw new Error('missing location header')
  return new URL(value)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(ensureSeeded).mockResolvedValue(undefined)
})

describe('GET /api/gate/[...path]', () => {
  it('sends anonymous users to /login with the full gated callback', async () => {
    vi.mocked(getSessionUser).mockResolvedValueOnce(null)
    const res = await GET(request('/tablero', '?key=1'), ctx(['tablero']))
    expect(res.status).toBe(307)
    const loc = location(res)
    expect(loc.pathname).toBe('/login')
    expect(loc.searchParams.get('callbackUrl')).toBe('/tablero?key=1')
  })

  it('redirects an authenticated user without permission to /forbidden', async () => {
    vi.mocked(getSessionUser).mockResolvedValueOnce(consulta)
    vi.mocked(loadRecursoAccessByRuta).mockResolvedValueOnce({
      id: 'r-borrador',
      access: BORRADOR,
    })
    const res = await GET(request('/tablero'), ctx(['tablero']))
    expect(res.status).toBe(307)
    expect(location(res).pathname).toBe('/forbidden')
  })

  it('returns 404 for a gated ruta with no catalog resource', async () => {
    vi.mocked(getSessionUser).mockResolvedValueOnce(admin)
    vi.mocked(loadRecursoAccessByRuta).mockResolvedValueOnce(null)
    const res = await GET(request('/tablero'), ctx(['tablero']))
    expect(res.status).toBe(404)
  })

  it('streams an allowed public file with the right MIME and headers', async () => {
    vi.mocked(getSessionUser).mockResolvedValueOnce(consulta)
    vi.mocked(loadRecursoAccessByRuta).mockResolvedValueOnce({
      id: 'r15',
      access: OPEN,
    })
    const res = await GET(
      request('/recursos/reporte-sobreedad-inicial.pdf'),
      ctx(['recursos', 'reporte-sobreedad-inicial.pdf']),
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    const body = await res.text()
    expect(body.startsWith('%PDF')).toBe(true)
  })

  it('streams the tablero pilot document and its inline capabilities', async () => {
    vi.mocked(getSessionUser).mockResolvedValueOnce(consulta)
    vi.mocked(loadRecursoAccessByRuta).mockResolvedValueOnce({
      id: 'r2',
      access: OPEN,
    })
    const res = await GET(request('/tablero'), ctx(['tablero']))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    const body = await res.text()
    expect(body).toContain('<title>Tablero Nominal de Alertas de Trayectorias')
    expect(body).toContain('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js')
  })

  it('never serves a path that escapes public/ (404 instead)', async () => {
    vi.mocked(getSessionUser).mockResolvedValueOnce(admin)
    vi.mocked(loadRecursoAccessByRuta).mockResolvedValueOnce({
      id: 'x',
      access: OPEN,
    })
    const res = await GET(
      request('/tablero/..%5C..%5Csecret'),
      ctx(['tablero', '..%5C..%5Csecret']),
    )
    expect(res.status).toBe(404)
  })

  it('returns 404 when the gated ruta exists but has no file on disk', async () => {
    vi.mocked(getSessionUser).mockResolvedValueOnce(admin)
    vi.mocked(loadRecursoAccessByRuta).mockResolvedValueOnce({
      id: 'x',
      access: OPEN,
    })
    const res = await GET(
      request('/mapa_sobreedad/inexistente.js'),
      ctx(['mapa_sobreedad', 'inexistente.js']),
    )
    expect(res.status).toBe(404)
  })
})
