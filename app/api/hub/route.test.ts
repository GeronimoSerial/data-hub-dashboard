import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Ruta from './route'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getSessionUser } from '@/lib/session'

// Igual que en otros route tests: no usar importOriginal, el módulo real
// importa @/lib/auth -> @/lib/db y cachearía la conexión antes de fijar
// DATA_DIR en beforeAll.
vi.mock('@/lib/session', () => ({
  getSessionUser: vi.fn(),
}))

usarDbTemporal('hub-route-', { seed: false })

let GET: typeof Ruta.GET

beforeAll(async () => {
  const { ensureSeeded } = await import('@/lib/db/seed')
  await ensureSeeded()

  // Además del catálogo público que siembra ensureSeeded, agrega un recurso
  // restringido a un nivel para ejercitar el filtro de audiencia acá mismo.
  const { getDb } = await import('@/lib/db')
  const { recursos, recursoAudienciaNivelesJur } = await import('@/lib/db/schema')
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
  await db.insert(recursoAudienciaNivelesJur).values({
    recursoId: 'hub-route-restringido',
    nivelJurisdiccionalId: 2,
  })
  GET = (await import('./route')).GET
})

beforeEach(() => {
  vi.mocked(getSessionUser).mockReset()
})

function consulta(over: Partial<Awaited<ReturnType<typeof getSessionUser>>> = {}) {
  return {
    id: 'consulta-1',
    role: 'consulta' as const,
    banned: false,
    nivelJurIds: [],
    accesoRecursos: 'todos' as const,
    recursoIds: [],
    ...over,
  }
}

type MarkedRecurso = { id: string; acceso: 'abrir' | 'ingresar' | 'restringido' }

describe('GET /api/hub', () => {
  it('sin sesión devuelve JSON 401 y no carga metadatos del catálogo', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(401)
    expect(res.headers.get('content-type')).toContain('application/json')
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(await res.json()).toEqual({ error: 'No autenticado' })
  })

  it('consulta+todos: el recurso restringido a otro nivel queda restringido, no se oculta', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(consulta())
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
      consulta({ nivelJurIds: [2] }),
    )
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
        nivelJurIds: [2],
      }),
    )
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
    const res = await GET()
    const data = await res.json()
    const recursos = data.recursos as MarkedRecurso[]
    expect(recursos.every((r) => r.acceso === 'abrir')).toBe(true)
  })

  it('denies a signed-in user whose explore section is disabled', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(consulta({
      hubPolicy: { enabledSections: ['maps'], landing: false },
    }))
    const res = await GET()
    expect(res.status).toBe(403)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(await res.json()).toEqual({ error: 'No tiene acceso a este recurso' })
  })
})
