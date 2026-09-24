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
  dir = mkdtempSync(path.join(tmpdir(), 'salud-route-'))
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
function admin() {
  return { id: 'admin-1', role: 'admin' as const, banned: false, nivelIds: [] }
}
function consulta() {
  return { id: 'consulta-1', role: 'consulta' as const, banned: false, nivelIds: [] }
}

async function contarJobs() {
  const { count } = await import('drizzle-orm')
  const { getDb } = await import('@/lib/db')
  const { infraJobRun } = await import('@/lib/db/schema')
  const [fila] = await getDb().select({ n: count() }).from(infraJobRun)
  return fila.n
}

describe('GET /api/infraestructura/operacion/salud', () => {
  it('rechaza sin sesión con 401', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    const { GET } = await import('./route')
    const res = await GET()
    expect(res.status).toBe(401)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('rechaza a consulta (no staff) con 403', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(consulta())
    const { GET } = await import('./route')
    const res = await GET()
    expect(res.status).toBe(403)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('admite a editor (staff) y devuelve flags, jobs y generadoEn', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(editor())
    const { GET } = await import('./route')
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    const data = await res.json()
    expect(data.flags).toBeTypeOf('object')
    expect(data.flags.riskEngineEnabled).toBeTypeOf('boolean')
    expect(data.flags.riskRadarEnabled).toBeTypeOf('boolean')
    expect(data.flags.aiBriefingEnabled).toBeTypeOf('boolean')
    expect(['shadow', 'advisory']).toContain(data.flags.riskMode)
    expect(Array.isArray(data.jobs)).toBe(true)
    expect(data.generadoEn).toBeTypeOf('string')
  })

  it('admite a admin y devuelve la misma forma', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(admin())
    const { GET } = await import('./route')
    const res = await GET()
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.flags).toBeTypeOf('object')
    expect(Array.isArray(data.jobs)).toBe(true)
    expect(data.generadoEn).toBeTypeOf('string')
  })

  it('no dispara ningún job: infra_job_run no cambia como efecto del GET', async () => {
    const antes = await contarJobs()
    vi.mocked(getSessionUser).mockResolvedValue(editor())
    const { GET } = await import('./route')
    const res = await GET()
    expect(res.status).toBe(200)
    const despues = await contarJobs()
    expect(despues).toBe(antes)
  })
})
