// @vitest-environment jsdom
import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Recurso } from '@/lib/model'
import { ResourceExperience } from './resource-experience'

const state = vi.hoisted(() => ({
  session: { isPending: false, data: { user: { id: 'u1' } } },
  relatedProps: [] as Array<Record<string, unknown>>,
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
    React.createElement('a', { ...props, href }, children),
}))
vi.mock('@/lib/auth-client', () => ({
  authClient: { useSession: () => state.session },
}))
vi.mock('@/components/app-shell', () => ({
  useResourceDetails: () => ({ expanded: false }),
}))
vi.mock('@/components/resource-card', () => ({
  ResourceCard: (props: Record<string, unknown>) => {
    state.relatedProps.push(props)
    return React.createElement('div', { 'data-testid': `related-${String(props.recurso && (props.recurso as Recurso).id)}` })
  },
}))
vi.mock('@/components/recurso-viewer', () => ({
  RecursoViewer: () => React.createElement('div', { 'data-testid': 'viewer' }),
}))
vi.mock('@/components/explain-resource', () => ({
  ExplainResource: () => React.createElement('button', null, 'Explicar'),
}))
vi.mock('@/components/share-view', () => ({
  ShareView: () => React.createElement('button', null, 'Compartir'),
}))
vi.mock('@/components/ui/button', () => ({
  Button: ({ render, children, ...props }: { render?: React.ReactElement; children: React.ReactNode }) =>
    render ? React.cloneElement(render, props, children) : React.createElement('button', props, children),
}))

const legacy: Recurso = {
  id: 'legacy-1',
  titulo: 'Mapa legacy',
  descripcion: 'Descripción del mapa',
  formato: 'mapa',
  nivelId: 'transversal',
  tipoId: 'georref',
  categoriaId: 'matricula',
  tagIds: [],
  area: 'Área',
  actualizado: '2026-08-01',
  estado: 'publicado',
  ruta: '/mapas/matricula?capa=1',
}

const related: Recurso = { ...legacy, id: 'related-1', titulo: 'Otro mapa' }

const taxonomies = {
  categorias: [{ id: 'matricula', nombre: 'Matrícula' }],
  niveles: [{ id: 'transversal', nombre: 'Transversal' }],
  tipos: [{ id: 'georref', nombre: 'Georreferencial' }],
}

describe('ResourceExperience navigation', () => {
  beforeEach(() => {
    state.relatedProps = []
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('shows an exact safe back link and a format-specific legacy CTA', () => {
    render(
      <ResourceExperience
        recurso={legacy}
        {...taxonomies}
        related={[legacy, related]}
        returnTo="/explorar?q=mapa&tema=matricula"
      />,
    )

    expect(screen.getByRole('link', { name: /volver a resultados/i })).toHaveAttribute(
      'href',
      '/explorar?q=mapa&tema=matricula',
    )
    expect(screen.getByRole('link', { name: /abrir mapa/i })).toHaveAttribute(
      'href',
      '/mapas/matricula?capa=1',
    )
    expect(screen.queryByTestId('viewer')).not.toBeInTheDocument()
  })

  it('uses Explore as fallback and does not propagate returnTo to related cards', () => {
    render(
      <ResourceExperience
        recurso={legacy}
        {...taxonomies}
        related={[legacy, related]}
        returnTo="https://evil.example"
      />,
    )

    expect(screen.getByRole('link', { name: /volver a resultados/i })).toHaveAttribute('href', '/explorar')
    expect(state.relatedProps).toHaveLength(1)
    expect(state.relatedProps[0]).not.toHaveProperty('returnTo')
  })

  it('keeps the embedded viewer for uploaded files', () => {
    render(
      <ResourceExperience
        recurso={{ ...legacy, ruta: undefined, storageKey: 'legacy/report.pdf', mime: 'application/pdf' }}
        {...taxonomies}
        related={[]}
      />,
    )
    expect(screen.getByTestId('viewer')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /abrir mapa/i })).not.toBeInTheDocument()
  })

  it('embeds only the tablero pilot through the existing gated file route', () => {
    render(
      <ResourceExperience
        recurso={{ ...legacy, id: 'r2', ruta: undefined, storageKey: 'r2/seed', mime: 'text/html' }}
        {...taxonomies}
        related={[]}
      />,
    )
    expect(screen.getByTitle('Mapa legacy')).toHaveAttribute('src', '/api/recursos/r2/archivo')
    expect(screen.getByRole('link', { name: /abrir en pantalla completa/i })).toHaveAttribute('href', '/tablero')
  })
})
