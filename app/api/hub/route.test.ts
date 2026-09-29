import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getSessionUser } from '@/lib/session'

// Igual que en otros route tests: no usar importOriginal, el módulo real
// importa @/lib/auth -> @/lib/db y cachearía la conexión antes de fijar
// DATA_DIR en beforeAll.
vi.mock('@/lib/session', () => ({
  getSessionUser: vi.fn(),
}))

usarDbTemporal('hub-route-', { seed: false })

beforeAll(async () => {
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

type MarkedRecurso = { id: string; acceso: 'abrir' | 'ingresar' | 'restringido' }

describe('GET /api/hub', () => {
  it('sin sesión devuelve todo el catálogo publicado, marcado como ingresar', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    const { GET } = await import('./route')
    const res = await GET()
    const data = await res.json()
    expect(data.recursos.length).toBeGreaterThan(0)
    expect(
      (data.recursos as MarkedRecurso[]).every((r) => r.acceso === 'ingresar'),
    ).toBe(true)
  })

  it('consulta+todos: el recurso restringido a otro nivel queda restringido, no se oculta', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(consulta())
    const { GET } = await import('./route')
    const res = await GET()
    const data = await res.json()
    const recursos = data.recursos as MarkedRecurso[]
    expect(recursos.some((r) => r.id === 'hub-route-restringido')).toBe(true)
    expect(
      recursos.find((r) => r.id === 'hub-route-restringido')?.acceso,
    ).toBe('restringido')
  })

  it('consulta+todos: abrir cuando su nivel coincide', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(
      consulta({ nivelIds: ['secundario'] }),
    )
    const { GET } = await import('./route')
    const res = await GET()
    const data = await res.json()
    const recursos = data.recursos as MarkedRecurso[]
    expect(
      recursos.find((r) => r.id === 'hub-route-restringido')?.acceso,
    ).toBe('abrir')
  })

  it('consulta+seleccionados: el listado abre, el resto queda restringido', async () => {
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
    const recursos = data.recursos as MarkedRecurso[]
    expect(recursos.length).toBeGreaterThan(1)
    expect(
      recursos.find((r) => r.id === 'hub-route-restringido')?.acceso,
    ).toBe('abrir')
    expect(
      recursos.filter((r) => r.id !== 'hub-route-restringido').every(
        (r) => r.acceso === 'restringido',
      ),
    ).toBe(true)
  })

  it('staff (audiencia restringida incluida): siempre abrir', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(
      consulta({ role: 'admin' as const }),
    )
    const { GET } = await import('./route')
    const res = await GET()
    const data = await res.json()
    const recursos = data.recursos as MarkedRecurso[]
    expect(recursos.every((r) => r.acceso === 'abrir')).toBe(true)
  })
})
