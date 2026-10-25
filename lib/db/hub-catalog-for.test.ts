import { describe, expect, it } from 'vitest'
import { filterCatalogForSections } from './hub-catalog-for'
import type { SessionUser } from '@/lib/acl'
import type { HubSection } from '@/lib/hub-sections'
import type { loadHubCatalog } from './hub'
import type { Recurso } from '@/lib/model'

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
