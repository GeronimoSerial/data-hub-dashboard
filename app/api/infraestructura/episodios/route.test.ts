import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getSessionUser } from '@/lib/session'

// No usa importOriginal: el módulo real importa @/lib/auth -> @/lib/db, que
// llamaría getDb() (y cachearía la conexión) al cargar el módulo, ANTES de
// que el beforeAll de este archivo fije DATA_DIR. Reimplementa staffGuard acá
// mismo (misma lógica que lib/session.ts) para no arrastrar esa cadena.
vi.mock('@/lib/session', () => ({
  getSessionUser: vi.fn(),
  staffGuard: (user: { banned: boolean; role: string } | null) => {
    if (!user) return { status: 401 as const, error: 'No autenticado' }
    if (user.banned || (user.role !== 'admin' && user.role !== 'editor')) {
      return { status: 403 as const, error: 'No tiene acceso a este recurso' }
    }
    return null
  },
}))

let dir: string
let prevDataDir: string | undefined

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'episodios-route-'))
  prevDataDir = process.env.DATA_DIR
  process.env.DATA_DIR = dir

  const { ensureSeeded } = await import('@/lib/db/seed')
  await ensureSeeded()
})

afterAll(() => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  rmSync(dir, { recursive: true, force: true })
})

beforeEach(() => {
  vi.mocked(getSessionUser).mockReset()
})

function editor() {
  return { id: 'editor-1', role: 'editor' as const, banned: false, nivelIds: [] }
}
function consulta() {
  return { id: 'consulta-1', role: 'consulta' as const, banned: false, nivelIds: [] }
}

function getReq(estado?: string) {
  const url = new URL('http://localhost/api/infraestructura/episodios')
  if (estado !== undefined) url.searchParams.set('estado', estado)
  return new Request(url, { method: 'GET' })
}

function postReq(body: unknown) {
  return new Request('http://localhost/api/infraestructura/episodios', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('GET /api/infraestructura/episodios', () => {
  it('rechaza sin sesión con 401', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    const { GET } = await import('./route')
    const res = await GET(getReq())
    expect(res.status).toBe(401)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('rechaza a consulta (no staff) con 403', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(consulta())
    const { GET } = await import('./route')
    const res = await GET(getReq())
    expect(res.status).toBe(403)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('admite a staff y devuelve la lista de episodios', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(editor())
    const { GET } = await import('./route')
    const res = await GET(getReq())
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(Array.isArray(data.episodios)).toBe(true)
  })
})

describe('POST /api/infraestructura/episodios', () => {
  it('crea un episodio y lo devuelve con estado abierto', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(editor())
    const { POST } = await import('./route')
    const res = await POST(postReq({ nombre: 'Episodio de prueba' }))
    expect(res.status).toBe(201)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.episodio.estado).toBe('abierto')
    expect(data.episodio.nombre).toBe('Episodio de prueba')
    expect(data.episodio.id).toBeTypeOf('string')
  })

  it('rechaza a consulta (no staff) con 403', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(consulta())
    const { POST } = await import('./route')
    const res = await POST(postReq({ nombre: 'Episodio de prueba' }))
    expect(res.status).toBe(403)
  })

  it('rechaza un body sin nombre con 400', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(editor())
    const { POST } = await import('./route')
    const res = await POST(postReq({ descripcion: 'sin nombre' }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBeTypeOf('string')
    expect(data.error.length).toBeGreaterThan(0)
  })
})
