import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ensureGeSchema, openGeDb } from '@/lib/infraestructura/ge-db'
import { getSessionUser } from '@/lib/session'

vi.mock('@/lib/session', () => ({
  getSessionUser: vi.fn(),
}))

const CUE = '1801605-04'
const CUE_AJENA = '9999999-99'

let dir: string
let prevDataDir: string | undefined

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'problematicas-admin-route-'))
  prevDataDir = process.env.DATA_DIR
  process.env.DATA_DIR = dir

  const ge = openGeDb()
  try {
    await ensureGeSchema(ge)
    await ge.execute(
      "INSERT INTO ge_corte (id, ciclo_lectivo, fetched_at, estado) VALUES (1, 2025, '2025-01-01T00:00:00Z', 'vigente')",
    )
    await ge.execute(
      `INSERT INTO ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, 10, '${CUE}', '1', 'A', 'PRIMARIA', 'MAÑANA')`,
    )
    await ge.execute(
      `INSERT INTO ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, 99, '${CUE_AJENA}', '1', 'A', 'PRIMARIA', 'MAÑANA')`,
    )
  } finally {
    ge.close()
  }

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

function postReq(body: unknown) {
  return new Request('http://localhost/api/infraestructura/problematicas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const bodyValido = {
  cue: CUE,
  motivo: 'Inundación',
  severidad: 'Alta',
  secciones: [10],
}

describe('POST /api/infraestructura/problematicas', () => {
  it('rechaza sin sesión con 401', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    const { POST } = await import('./route')
    const res = await POST(postReq(bodyValido))
    expect(res.status).toBe(401)
  })

  it('rechaza a consulta con 403', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({
      id: 'user-consulta',
      role: 'consulta',
      banned: false,
      nivelIds: [],
    })
    const { POST } = await import('./route')
    const res = await POST(postReq(bodyValido))
    expect(res.status).toBe(403)
  })

  it('rechaza a editor con 403', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({
      id: 'user-editor',
      role: 'editor',
      banned: false,
      nivelIds: [],
    })
    const { POST } = await import('./route')
    const res = await POST(postReq(bodyValido))
    expect(res.status).toBe(403)
  })

  it('rechaza a un admin baneado con 403 pese al rol', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({
      id: 'admin-baneado',
      role: 'admin',
      banned: true,
      nivelIds: [],
    })
    const { POST } = await import('./route')
    const res = await POST(postReq(bodyValido))
    expect(res.status).toBe(403)
  })

  it('admite a admin y registra la problemática con origen admin', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({
      id: 'admin-1',
      role: 'admin',
      banned: false,
      nivelIds: [],
    })
    const { POST } = await import('./route')
    const res = await POST(postReq(bodyValido))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(typeof data.id).toBe('string')

    const { getDb } = await import('@/lib/db')
    const { infraProblematica } = await import('@/lib/db/schema')
    const { eq } = await import('drizzle-orm')
    const [row] = await getDb()
      .select()
      .from(infraProblematica)
      .where(eq(infraProblematica.id, data.id))
    expect(row.origen).toBe('admin')
  })

  it('rechaza una sección que no pertenece al CUE indicado', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({
      id: 'admin-2',
      role: 'admin',
      banned: false,
      nivelIds: [],
    })
    const { POST } = await import('./route')
    const res = await POST(postReq({ ...bodyValido, secciones: [99] }))
    expect(res.status).toBe(400)
  })

  it('rechaza un cuerpo inválido', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({
      id: 'admin-3',
      role: 'admin',
      banned: false,
      nivelIds: [],
    })
    const { POST } = await import('./route')
    const res = await POST(postReq({ ...bodyValido, motivo: 'Motivo inexistente' }))
    expect(res.status).toBe(400)
  })
})

describe('GET /api/infraestructura/problematicas', () => {
  it('rechaza sin sesión con 401', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    const { GET } = await import('./route')
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('rechaza a consulta y editor con 403', async () => {
    const { GET } = await import('./route')

    vi.mocked(getSessionUser).mockResolvedValue({
      id: 'user-consulta',
      role: 'consulta',
      banned: false,
      nivelIds: [],
    })
    expect((await GET()).status).toBe(403)

    vi.mocked(getSessionUser).mockResolvedValue({
      id: 'user-editor',
      role: 'editor',
      banned: false,
      nivelIds: [],
    })
    expect((await GET()).status).toBe(403)
  })

  it('lista las problemáticas para un admin', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({
      id: 'admin-listado',
      role: 'admin',
      banned: false,
      nivelIds: [],
    })
    const { GET } = await import('./route')
    const res = await GET()
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data.problematicas)).toBe(true)
    expect(data.problematicas.length).toBeGreaterThan(0)
    expect(data.problematicas[0]).toHaveProperty('seccionesCantidad')
  })
})
