import { describe, expect, it } from 'vitest'
import {
  adminSectionFromHash,
  adminSectionHref,
  adminSectionsForRole,
  normalizeAdminSection,
} from './admin-navigation'

describe('admin navigation contract', () => {
  it('exposes every admin deep link and groups it in one config', () => {
    const sections = adminSectionsForRole('admin')
    expect(sections.map((section) => section.id)).toEqual([
      'recursos', 'categorias', 'tags', 'niveles', 'tipos', 'usuarios',
    ])
    expect(sections.map((section) => adminSectionHref(section.id))).toEqual([
      '/admin?section=recursos',
      '/admin?section=categorias',
      '/admin?section=tags',
      '/admin?section=niveles',
      '/admin?section=tipos',
      '/admin?section=usuarios',
    ])
  })

  it('restricts editors to resources and normalizes invalid sections', () => {
    expect(adminSectionsForRole('editor').map((section) => section.id)).toEqual(['recursos'])
    expect(normalizeAdminSection(undefined, 'admin')).toBe('recursos')
    expect(normalizeAdminSection('unknown', 'admin')).toBe('recursos')
    expect(normalizeAdminSection('usuarios', 'editor')).toBe('recursos')
    expect(normalizeAdminSection('recursos', 'editor')).toBe('recursos')
  })

  it('maps historical hashes only when they are known sections', () => {
    expect(adminSectionFromHash('#usuarios')).toBe('usuarios')
    expect(adminSectionFromHash('categorias')).toBe('categorias')
    expect(adminSectionFromHash('#unknown')).toBeNull()
    expect(adminSectionFromHash(null)).toBeNull()
  })
})
