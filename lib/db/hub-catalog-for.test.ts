import { describe, expect, it, vi } from 'vitest'
import { buildCatalogResponse, filterCatalogForAccess, filterCatalogForSections } from './hub-catalog-for'
import type { SessionUser } from '@/lib/acl'
import type { HubSection } from '@/lib/hub-sections'
import { loadHubCatalog } from '@/lib/db/hub'
import type { Recurso } from '@/lib/model'

vi.mock('@/lib/db/hub', () => ({ loadHubCatalog: vi.fn() }))

const recursos: Recurso[] = [
  { id: 'infra', formato: 'mapa', ruta: '/mapas/infraestructura', nivelId: 'n-infra', tipoId: 't-map', categoriaId: 'c-infra', tagIds: ['tag-infra'], estado: 'borrador', titulo: 'Infra', descripcion: '', area: '', actualizado: '' },
  { id: 'map', formato: 'mapa', nivelId: 'n-map', tipoId: 't-map', categoriaId: 'c-map', tagIds: ['tag-map'], estado: 'publicado', titulo: 'Map', descripcion: '', area: '', actualizado: '' },
  { id: 'report', formato: 'reporte', nivelId: 'n-report', tipoId: 't-report', categoriaId: 'c-report', tagIds: ['tag-report'], estado: 'publicado', titulo: 'Report', descripcion: '', area: '', actualizado: '' },
]

const catalog: Awaited<ReturnType<typeof loadHubCatalog>> = {
  recursos,
  niveles: ['n-infra', 'n-map', 'n-report'].map((id) => ({ id, nombre: id, orden: 0 })),
  tipos: ['t-map', 't-report'].map((id) => ({ id, nombre: id, aplicaA: [] })),
  categorias: ['c-infra', 'c-map', 'c-report'].map((id) => ({ id, nombre: id, color: 'brand' as const })),
  tags: ['tag-infra', 'tag-map', 'tag-report'].map((id) => ({ id, nombre: id })),
}

function staff(enabledSections?: HubSection[]) {
  return {
    id: 'staff', role: 'editor' as const, banned: false, nivelJurIds: [],
    accesoRecursos: 'todos' as const, recursoIds: [],
    ...(enabledSections === undefined ? {} : { hubPolicy: { enabledSections, landing: false } }),
  } as SessionUser
}

describe('filterCatalogForSections', () => {
  it('filters resources and every shared taxonomy by effective section for restricted staff', () => {
    const result = filterCatalogForSections(catalog, staff(['infrastructure']))
    expect(result.recursos.map(({ id }) => id)).toEqual(['infra'])
    expect(result.niveles.map(({ id }) => id)).toEqual(['n-infra'])
    expect(result.tipos.map(({ id }) => id)).toEqual(['t-map'])
    expect(result.categorias.map(({ id }) => id)).toEqual(['c-infra'])
    expect(result.tags.map(({ id }) => id)).toEqual(['tag-infra'])
  })

  it('keeps only reports for reports-only staff', () => {
    expect(filterCatalogForSections(catalog, staff(['reports'])).recursos.map(({ id }) => id)).toEqual(['report'])
  })

  it('keeps only maps for maps-only staff', () => {
    expect(filterCatalogForSections(catalog, staff(['maps'])).recursos.map(({ id }) => id)).toEqual(['map'])
  })

  it('returns no content or taxonomy for an explicit empty policy', () => {
    const result = filterCatalogForSections(catalog, staff([]))
    expect(Object.values(result).every((rows) => rows.length === 0)).toBe(true)
  })

  it('preserves all known sections for legacy unset policy', () => {
    expect(filterCatalogForSections(catalog, staff()).recursos).toHaveLength(3)
  })
})

const acceso: Recurso[] = [
  { id: 'sin-audiencia', formato: 'reporte', nivelId: 'n-sin', tipoId: 't-report', categoriaId: 'c-sin', tagIds: ['tag-sin'], estado: 'publicado', titulo: 'Sin', descripcion: '', area: '', actualizado: '' },
  { id: 'otro-nivel', formato: 'reporte', nivelId: 'n-otro', tipoId: 't-report', categoriaId: 'c-otro', tagIds: ['tag-otro'], estado: 'publicado', audienciaNivelJurIds: [9], titulo: 'Otro', descripcion: '', area: '', actualizado: '' },
  { id: 'mi-nivel', formato: 'reporte', nivelId: 'n-mi', tipoId: 't-report', categoriaId: 'c-mi', tagIds: ['tag-mi'], estado: 'publicado', audienciaNivelJurIds: [2], titulo: 'Mi', descripcion: '', area: '', actualizado: '' },
  { id: 'infra', formato: 'mapa', ruta: '/mapas/infraestructura', nivelId: 'n-infra', tipoId: 't-map', categoriaId: 'c-infra', tagIds: ['tag-infra'], estado: 'publicado', titulo: 'Infra', descripcion: '', area: '', actualizado: '' },
]

const catalogoAcceso: Awaited<ReturnType<typeof loadHubCatalog>> = {
  recursos: acceso,
  niveles: ['n-sin', 'n-otro', 'n-mi', 'n-infra'].map((id) => ({ id, nombre: id, orden: 0 })),
  tipos: ['t-report', 't-map'].map((id) => ({ id, nombre: id, aplicaA: [] })),
  categorias: ['c-sin', 'c-otro', 'c-mi', 'c-infra'].map((id) => ({ id, nombre: id, color: 'brand' as const })),
  tags: ['tag-sin', 'tag-otro', 'tag-mi', 'tag-infra'].map((id) => ({ id, nombre: id })),
}

function usuario(role: SessionUser['role'], over: Partial<SessionUser> = {}): SessionUser {
  return { id: 'u-1', role, banned: false, nivelJurIds: [2], accesoRecursos: 'todos', recursoIds: [], ...over }
}

const ids = (items: { id: string }[]) => items.map(({ id }) => id)

describe('filterCatalogForAccess', () => {
  it('quita de la consulta los recursos sin audiencia o con audiencia que no incluye al usuario', () => {
    const result = filterCatalogForAccess(catalogoAcceso, usuario('consulta'))
    expect(ids(result.recursos)).toEqual(['mi-nivel', 'infra'])
  })

  it('conserva el mapa de infraestructura sin audiencia para la consulta', () => {
    const result = filterCatalogForAccess(catalogoAcceso, usuario('consulta', { nivelJurIds: [] }))
    expect(ids(result.recursos)).toEqual(['infra'])
  })

  it('poda niveles, tipos, categorías y tags a los que quedan referenciados', () => {
    const result = filterCatalogForAccess(catalogoAcceso, usuario('consulta'))
    expect(ids(result.niveles)).toEqual(['n-mi', 'n-infra'])
    expect(ids(result.tipos)).toEqual(['t-report', 't-map'])
    expect(ids(result.categorias)).toEqual(['c-mi', 'c-infra'])
    expect(ids(result.tags)).toEqual(['tag-mi', 'tag-infra'])
  })

  it('muestra solo los asignados cuando el acceso es por lista', () => {
    const result = filterCatalogForAccess(catalogoAcceso, usuario('consulta', { accesoRecursos: 'seleccionados', recursoIds: ['sin-audiencia'] }))
    expect(ids(result.recursos)).toEqual(['sin-audiencia'])
  })

  it('no quita nada al staff', () => {
    expect(ids(filterCatalogForAccess(catalogoAcceso, usuario('admin')).recursos)).toEqual(['sin-audiencia', 'otro-nivel', 'mi-nivel', 'infra'])
    expect(ids(filterCatalogForAccess(catalogoAcceso, usuario('editor')).recursos)).toEqual(['sin-audiencia', 'otro-nivel', 'mi-nivel', 'infra'])
  })

  it('no quita nada sin sesión', () => {
    expect(ids(filterCatalogForAccess(catalogoAcceso, null).recursos)).toHaveLength(4)
  })
})

describe('buildCatalogResponse with access', () => {
  it('entrega a la consulta solo lo que puede abrir, todo marcado abrir', async () => {
    vi.mocked(loadHubCatalog).mockResolvedValue(catalogoAcceso)
    const response = await buildCatalogResponse(usuario('consulta'), { publishedOnly: true })
    expect(response.recursos.map(({ id, acceso }) => [id, acceso])).toEqual([['mi-nivel', 'abrir'], ['infra', 'abrir']])
  })

  it('mantiene todo el catálogo para el staff', async () => {
    vi.mocked(loadHubCatalog).mockResolvedValue(catalogoAcceso)
    const response = await buildCatalogResponse(usuario('admin'), { publishedOnly: false })
    expect(response.recursos).toHaveLength(4)
    expect(response.recursos.every(({ acceso }) => acceso === 'abrir')).toBe(true)
  })
})
