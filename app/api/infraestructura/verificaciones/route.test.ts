import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { eq } from 'drizzle-orm'
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
  return { id: 'editor-1', role: 'editor' as const, banned: false, nivelIds: [], accesoRecursos: 'todos' as const, recursoIds: [] }
}
function consulta() {
  return { id: 'consulta-1', role: 'consulta' as const, banned: false, nivelIds: [], accesoRecursos: 'todos' as const, recursoIds: [] }
}

// Marca el único período sembrado como 'historico' para simular "sin período
// vigente" y lo restaura al terminar: el resto de los tests del archivo
// comparten la misma base y necesitan el período vigente sembrado.
async function sinPeriodoVigente(): Promise<() => Promise<void>> {
  const { getDb } = await import('@/lib/db')
  const { infraPeriodo } = await import('@/lib/db/schema')
  const db = getDb()
  await db.update(infraPeriodo).set({ estado: 'historico' }).where(eq(infraPeriodo.id, periodoId))
  return async () => {
    await db.update(infraPeriodo).set({ estado: 'vigente' }).where(eq(infraPeriodo.id, periodoId))
  }
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
    const { crearVerificacion, obtenerVerificacion } = await import(
      '@/lib/infraestructura/verificaciones'
    )
    const a = await crearVerificacion({
      cueAnexo: 'CUE-LISTA-A',
      solicitadaPorUserId: 'editor-1',
    })
    const b = await crearVerificacion({
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
        `http://localhost/api/infraestructura/verificaciones?periodoId=${periodoId}`,
      ),
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')

    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.verificaciones.length).toBeGreaterThanOrEqual(2)
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
        body: JSON.stringify({ cueAnexo: 'y' }),
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
        body: JSON.stringify({ cueAnexo: 'y' }),
      }),
    )
    expect(res.status).toBe(403)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('crea una verificación anclada al período vigente y devuelve el token una sola vez', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(editor())
    const { POST } = await import('./route')
    const res = await POST(
      new Request('http://localhost/api/infraestructura/verificaciones', {
        method: 'POST',
        body: JSON.stringify({
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
    expect(data.verificacion.periodoId).toBe(periodoId)
    expect(data.verificacion.cueAnexo).toBe('CUE-CREADA')
    expect(data.verificacion.solicitadaPorUserId).toBe('editor-1')
  })

  it('devuelve 409 si no hay período vigente', async () => {
    const restaurar = await sinPeriodoVigente()
    try {
      vi.mocked(getSessionUser).mockResolvedValue(editor())
      const { POST } = await import('./route')
      const res = await POST(
        new Request('http://localhost/api/infraestructura/verificaciones', {
          method: 'POST',
          body: JSON.stringify({ cueAnexo: 'CUE-SIN-PERIODO' }),
        }),
      )
      expect(res.status).toBe(409)
      const data = await res.json()
      expect(data.error).toBe('No hay un período vigente')
    } finally {
      await restaurar()
    }
  })
})
