import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Route from './route'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getSessionUser } from '@/lib/session'
import type { HubSection } from '@/lib/hub-sections'

vi.mock('@/lib/session', () => ({
  getSessionUser: vi.fn(),
  staffGuard: (user: { role: string; banned: boolean } | null) =>
    !user ? { status: 401, error: 'No autenticado' }
      : user.banned || !['admin', 'editor'].includes(user.role) ? { status: 403, error: 'No tiene acceso a este recurso' }
        : null,
}))

usarDbTemporal('hub-admin-route-', { seed: false })

let GET: typeof Route.GET

beforeAll(async () => {
  GET = (await import('./route')).GET
})

beforeEach(() => vi.mocked(getSessionUser).mockReset())

function staff(enabledSections?: HubSection[]) {
  return {
    id: 'staff', role: 'editor' as const, banned: false, nivelJurIds: [],
    accesoRecursos: 'todos' as const, recursoIds: [],
    ...(enabledSections === undefined ? {} : { hubPolicy: { enabledSections, landing: false } }),
  }
}

describe('GET /api/hub/admin section visibility', () => {
  it.each([
    ['infrastructure', ['infrastructure']],
    ['maps', ['maps']],
    ['reports', ['reports']],
    ['empty', []],
    ['legacy unset', undefined],
  ])('filters server catalog and shared taxonomy for %s staff', async (_name, sections) => {
    vi.mocked(getSessionUser).mockResolvedValue(staff(sections as HubSection[] | undefined))
    const response = await GET(new Request('http://localhost/api'))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    const catalog = await response.json()
    const resourceIds = new Set((catalog.recursos as { id: string; formato: string; ruta?: string }[]).map((resource) => resource.id))
    const enabled = sections as string[] | undefined
    if (enabled?.length === 0) {
      expect(catalog).toMatchObject({ recursos: [], niveles: [], tipos: [], categorias: [], tags: [] })
      return
    }
    for (const resource of catalog.recursos as { id: string; formato: string; ruta?: string }[]) {
      if (enabled === undefined) continue
      if (resource.ruta?.startsWith('/mapas/infraestructura')) expect(enabled).toContain('infrastructure')
      else if (resource.formato === 'reporte') expect(enabled).toContain('reports')
      else if (resource.formato === 'mapa') expect(enabled).toContain('maps')
      else if (resource.formato === 'tablero') expect(enabled).toContain('dashboards')
    }
    expect((catalog.recursos as { id: string }[]).every((resource) => resourceIds.has(resource.id))).toBe(true)
    for (const field of ['niveles', 'tipos', 'categorias', 'tags'] as const) {
      const referenced = field === 'niveles' ? new Set((catalog.recursos as { nivelId: string }[]).map((r) => r.nivelId))
        : field === 'tipos' ? new Set((catalog.recursos as { tipoId: string }[]).map((r) => r.tipoId))
          : field === 'categorias' ? new Set((catalog.recursos as { categoriaId: string }[]).map((r) => r.categoriaId))
            : new Set((catalog.recursos as { tagIds: string[] }[]).flatMap((r) => r.tagIds))
      expect((catalog[field] as { id: string }[]).every((item) => referenced.has(item.id))).toBe(true)
    }
  })
})
