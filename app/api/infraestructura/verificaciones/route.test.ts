import { randomUUID } from 'node:crypto'
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
let periodoId: string

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'verificaciones-route-'))
  prevDataDir = process.env.DATA_DIR
  process.env.DATA_DIR = dir

  const seed = await import('@/lib/db/seed')
  periodoId = seed.PERIODO_ENOS_2026_2027_ID
  await seed.ensureSeeded()
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

async function nuevoEpisodioAbierto() {
  const { crearEpisodio } = await import('@/lib/infraestructura/episodios')
  return crearEpisodio({ periodoId, nombre: `episodio-${randomUUID()}` })
}

function getRequest(url: string) {
  return new Request(url)
}

describe('GET /api/infraestructura/verificaciones', () => {
  it('rechaza sin sesión con 401', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    const { GET } = await import('./route')
    const res = await GET(getRequest('http://localhost/api/infraestructura/verificaciones'))
    expect(res.status).toBe(401)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('rechaza a consulta (no staff) con 403', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(consulta())
    const { GET } = await import('./route')
    const res = await GET(getRequest('http://localhost/api/infraestructura/verificaciones'))
    expect(res.status).toBe(403)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('lista las verificaciones sin exponer tokenHash', async () => {
    const episodio = await nuevoEpisodioAbierto()
    const { crearVerificacion, obtenerVerificacion } = await import(
      '@/lib/infraestructura/verificaciones'
    )
    const a = await crearVerificacion({
      episodioId: episodio.id,
      cueAnexo: 'CUE-LISTA-A',
      solicitadaPorUserId: 'editor-1',
    })
    const b = await crearVerificacion({
      episodioId: episodio.id,
      cueAnexo: 'CUE-LISTA-B',
      solicitadaPorUserId: 'editor-1',
    })
    expect(a.ok && b.ok).toBe(true)

    const filaA = await obtenerVerificacion(a.ok ? a.verificacion.id : '')
    expect(filaA?.tokenHash).toBeTypeOf('string')

    vi.mocked(getSessionUser).mockResolvedValue(editor())
    const { GET } = await import('./route')
    const res = await GET(
      getRequest(
        `http://localhost/api/infraestructura/verificaciones?episodioId=${episodio.id}`,
      ),
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')

    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.verificaciones).toHaveLength(2)
    for (const v of data.verificaciones) {
      expect('tokenHash' in v).toBe(false)
    }
    expect(JSON.stringify(data)).not.toContain(filaA?.tokenHash)
  })

  it('rechaza un estado inválido con 400', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(editor())
    const { GET } = await import('./route')
    const res = await GET(
      getRequest('http://localhost/api/infraestructura/verificaciones?estado=inventado'),
    )
    expect(res.status).toBe(400)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  })
})

describe('POST /api/infraestructura/verificaciones', () => {
  it('rechaza sin sesión con 401', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    const { POST } = await import('./route')
    const res = await POST(
      new Request('http://localhost/api/infraestructura/verificaciones', {
        method: 'POST',
        body: JSON.stringify({ episodioId: 'x', cueAnexo: 'y' }),
      }),
    )
    expect(res.status).toBe(401)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('rechaza a consulta (no staff) con 403', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(consulta())
    const { POST } = await import('./route')
    const res = await POST(
      new Request('http://localhost/api/infraestructura/verificaciones', {
        method: 'POST',
        body: JSON.stringify({ episodioId: 'x', cueAnexo: 'y' }),
      }),
    )
    expect(res.status).toBe(403)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('crea una verificación con episodio abierto y devuelve el token una sola vez', async () => {
    const episodio = await nuevoEpisodioAbierto()
    vi.mocked(getSessionUser).mockResolvedValue(editor())
    const { POST } = await import('./route')
    const res = await POST(
      new Request('http://localhost/api/infraestructura/verificaciones', {
        method: 'POST',
        body: JSON.stringify({
          episodioId: episodio.id,
          cueAnexo: 'CUE-CREADA',
          vencimientoEn: '2026-12-31T00:00:00.000Z',
        }),
      }),
    )
    expect(res.status).toBe(201)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')

    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.token).toBeTypeOf('string')
    expect(data.token.length).toBeGreaterThan(0)
    expect(data.verificacion.tokenHash).toBeUndefined()
    expect('tokenHash' in data.verificacion).toBe(false)
    expect(data.verificacion.estado).toBe('pendiente')
    expect(data.verificacion.cueAnexo).toBe('CUE-CREADA')
    expect(data.verificacion.solicitadaPorUserId).toBe('editor-1')
  })

  it('devuelve 404 si el episodio no existe', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(editor())
    const { POST } = await import('./route')
    const res = await POST(
      new Request('http://localhost/api/infraestructura/verificaciones', {
        method: 'POST',
        body: JSON.stringify({ episodioId: 'episodio-inexistente', cueAnexo: 'CUE-X' }),
      }),
    )
    expect(res.status).toBe(404)
    const data = await res.json()
    expect(data.error).toBe('El episodio no existe')
  })

  it('devuelve 409 si el episodio está cerrado', async () => {
    const episodio = await nuevoEpisodioAbierto()
    const { cerrarEpisodio } = await import('@/lib/infraestructura/episodios')
    const cerrado = await cerrarEpisodio({ episodioId: episodio.id })
    expect(cerrado.ok).toBe(true)

    vi.mocked(getSessionUser).mockResolvedValue(editor())
    const { POST } = await import('./route')
    const res = await POST(
      new Request('http://localhost/api/infraestructura/verificaciones', {
        method: 'POST',
        body: JSON.stringify({ episodioId: episodio.id, cueAnexo: 'CUE-CERRADA' }),
      }),
    )
    expect(res.status).toBe(409)
    const data = await res.json()
    expect(data.error).toBe('El episodio está cerrado')
  })
})
