import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getSessionUser } from '@/lib/session'

// Igual que en otros route tests: no usar importOriginal, el módulo real
// importa @/lib/auth -> @/lib/db y cachearía la conexión antes de fijar
// DATA_DIR en beforeAll.
vi.mock('@/lib/session', () => ({
  getSessionUser: vi.fn(),
}))

let dir: string
let prevDataDir: string | undefined

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'hub-route-'))
  prevDataDir = process.env.DATA_DIR
  process.env.DATA_DIR = dir

  const { ensureSeeded } = await import('@/lib/db/seed')
  await ensureSeeded()

  // Además del catálogo público que siembra ensureSeeded, agrega un recurso
  // restringido a un nivel para ejercitar el filtro de audiencia acá mismo.
  const { getDb } = await import('@/lib/db')
  const { recursos, recursoAudienciaNiveles } = await import('@/lib/db/schema')
  const db = getDb()
  await db.insert(recursos).values({
    id: 'hub-route-restringido',
    titulo: 'Restringido secundario',
    descripcion: 'Solo secundario',
    formato: 'reporte',
    nivelId: 'secundario',
    tipoId: 'informe',
    categoriaId: 'matricula',
    area: 'DGE',
    actualizado: '2026-01-01',
    estado: 'publicado',
  })
  await db.insert(recursoAudienciaNiveles).values({
    recursoId: 'hub-route-restringido',
    nivelId: 'secundario',
  })
})

afterAll(() => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  rmSync(dir, { recursive: true, force: true })
})

beforeEach(() => {
  vi.mocked(getSessionUser).mockReset()
})

function consulta(over: Partial<Awaited<ReturnType<typeof getSessionUser>>> = {}) {
  return {
    id: 'consulta-1',
    role: 'consulta' as const,
    banned: false,
    nivelIds: [],
    accesoRecursos: 'todos' as const,
    recursoIds: [],
    ...over,
  }
}

describe('GET /api/hub', () => {
  it('sin sesión no devuelve ningún recurso (no hay catálogo público sin ACL)', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    const { GET } = await import('./route')
    const res = await GET()
    const data = await res.json()
    expect(data.recursos).toEqual([])
  })

  it('consulta+todos no ve el recurso restringido a otro nivel', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(consulta())
    const { GET } = await import('./route')
    const res = await GET()
    const data = await res.json()
    expect(
      data.recursos.some((r: { id: string }) => r.id === 'hub-route-restringido'),
    ).toBe(false)
  })

  it('consulta+todos ve el recurso restringido cuando su nivel coincide', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(
      consulta({ nivelIds: ['secundario'] }),
    )
    const { GET } = await import('./route')
    const res = await GET()
    const data = await res.json()
    expect(
      data.recursos.some((r: { id: string }) => r.id === 'hub-route-restringido'),
    ).toBe(true)
  })

  it('consulta+seleccionados solo ve los recursos listados', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(
      consulta({
        accesoRecursos: 'seleccionados',
        recursoIds: ['hub-route-restringido'],
        nivelIds: ['secundario'],
      }),
    )
    const { GET } = await import('./route')
    const res = await GET()
    const data = await res.json()
    expect(data.recursos.map((r: { id: string }) => r.id)).toEqual([
      'hub-route-restringido',
    ])
  })

  it('staff ve todo lo publicado sin restricción de audiencia', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(
      consulta({ role: 'admin' as const }),
    )
    const { GET } = await import('./route')
    const res = await GET()
    const data = await res.json()
    expect(
      data.recursos.some((r: { id: string }) => r.id === 'hub-route-restringido'),
    ).toBe(true)
  })
})
