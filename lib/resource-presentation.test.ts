import { describe, expect, it } from 'vitest'
import {
  presentResource,
  relatedResources,
  RESOURCE_ACCESS_LABEL,
  resourceAccessState,
} from './resource-presentation'
import type { Recurso } from './model'

const base: Recurso = { id: 'r1', titulo: 'Mapa', descripcion: 'Descripción', formato: 'mapa', nivelId: 'transversal', tipoId: 'georref', categoriaId: 'matricula', tagIds: ['territorial'], area: 'Área', actualizado: '2026-08-01', estado: 'publicado', ruta: '/mapas/matricula' }

const taxonomies = {
  categorias: [{ id: 'matricula', nombre: 'Matrícula' }],
  niveles: [{ id: 'transversal', nombre: 'Transversal' }],
  tipos: [{ id: 'georref', nombre: 'Georreferencial' }],
}

describe('resource presentation', () => {
  it('uses semantic labels and format-specific action', () => {
    const view = presentResource(base, taxonomies)
    expect(view.topicLabel).toBe('Matrícula')
    expect(view.primaryAction).toBe('Abrir mapa')
    expect(view.breadcrumbs.map((item) => item.label)).toEqual(['Explorar', 'Matrícula', 'Mapa'])
  })

  it('ranks related published resources deterministically', () => {
    const same: Recurso = { ...base, id: 'same', titulo: 'Relacionado' }
    const draft: Recurso = { ...same, id: 'draft', estado: 'borrador' }
    expect(relatedResources(base, [base, draft, same]).map((item) => item.id)).toEqual(['same'])
  })
})

describe('resource access states (batch spec wording)', () => {
  it('shows "Ingresar para consultar" while unauthenticated or pending', () => {
    expect(resourceAccessState(base, { isPending: true, hasUser: false })).toBe('sign-in')
    expect(resourceAccessState(base, { isPending: false, hasUser: false })).toBe('sign-in')
  })

  it('shows "Público" for no-audience resources once signed in', () => {
    expect(resourceAccessState(base, { isPending: false, hasUser: true })).toBe('public')
  })

  it('shows "Acceso restringido" when an audience exists regardless of session', () => {
    const restricted = { audienciaNivelIds: ['secundario'], audienciaUserIds: [] }
    expect(resourceAccessState(restricted, { isPending: false, hasUser: true })).toBe('restricted')
    expect(resourceAccessState(restricted, { isPending: false, hasUser: false })).toBe('restricted')
  })

  it('maps every state to the canonical user-facing labels', () => {
    expect(RESOURCE_ACCESS_LABEL.public).toBe('Público')
    expect(RESOURCE_ACCESS_LABEL['sign-in']).toBe('Ingresar para consultar')
    expect(RESOURCE_ACCESS_LABEL.restricted).toBe('Acceso restringido')
  })
})