import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getSessionUser } from '@/lib/session'

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
  dir = mkdtempSync(path.join(tmpdir(), 'situacion-cambios-route-'))
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

function url(qs: string): Request {
  return new Request(`http://localhost/api/infraestructura/situacion/cambios${qs}`)
}

describe('GET /api/infraestructura/situacion/cambios', () => {
  it('rechaza sin sesión con 401', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    const { GET } = await import('./route')
    const res = await GET(url('?desde=2026-01-01T00:00:00.000Z'))
    expect(res.status).toBe(401)
  })

  it('sin "desde" devuelve 400', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(editor())
    const { GET } = await import('./route')
    const res = await GET(url(''))
    expect(res.status).toBe(400)
  })

  it('con "desde" inválido devuelve 400', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(editor())
    const { GET } = await import('./route')
    const res = await GET(url('?desde=no-es-una-fecha'))
    expect(res.status).toBe(400)
  })

  it('territorioId sin territorioTipo devuelve 400', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(editor())
    const { GET } = await import('./route')
    const res = await GET(url('?desde=2026-01-01T00:00:00.000Z&territorioId=PARANA'))
    expect(res.status).toBe(400)
  })

  it('con "desde" válido responde 200 con ambas listas (registro y vigencia), vacías sin datos', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(editor())
    const { GET } = await import('./route')
    const res = await GET(url('?desde=2026-01-01T00:00:00.000Z'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('porRegistro')
    expect(body).toHaveProperty('porVigencia')
    expect(body.porRegistro).toEqual([])
    expect(body.porVigencia).toEqual([])
  })
})
