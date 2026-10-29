// @vitest-environment jsdom
import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { recursos, type Recurso } from '@/lib/model'

const state = vi.hoisted(() => ({ expanded: false }))
vi.mock('@/components/hub-data', () => ({ useHubData: () => ({ niveles: [], categorias: [] }) }))
vi.mock('@/lib/auth-client', () => ({ authClient: { useSession: () => ({ data: { user: { id: 'reader' } }, isPending: false }) } }))
vi.mock('@/components/app-shell', () => ({ useResourceDetails: () => state, useSectionAccess: () => () => true }))
vi.mock('@/components/recurso-viewer', () => ({ RecursoViewer: () => <div>Visor</div> }))
vi.mock('@/components/explain-resource', () => ({ ExplainResource: () => null }))
vi.mock('@/components/share-view', () => ({ ShareView: () => null }))

import { ResourceCard } from './resource-card'
import { ResourceExperience } from './resource-experience'

afterEach(cleanup)
const nuevo: Recurso = { ...recursos[0], id: 'html', titulo: 'Título editorial', storageKey: 'html/uuid', mime: 'text/html', nombreOriginal: 'Original.html', cargadoEn: '2026-10-20T12:00:00Z', acceso: 'abrir' }
const viejo: Recurso = { ...nuevo, nombreOriginal: undefined, cargadoEn: undefined }

it.each([nuevo, viejo])('cards include metadata and an independent download link ($nombreOriginal)', (recurso) => {
  const { container } = render(<ResourceCard recurso={recurso} />)
  expect(screen.getByRole('heading', { name: 'Título editorial' })).toBeTruthy()
  expect(screen.getByText(recurso.nombreOriginal ?? 'Nombre original no disponible')).toBeTruthy()
  expect(screen.getByText(recurso.cargadoEn ? '20/10/2026' : 'Fecha no registrada')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Descargar archivo' }).getAttribute('href')).toContain('?download=1')
  expect(container.querySelector('a a')).toBeNull()
})

it.each([false, true])('viewer exposes metadata even with details expanded=%s', (expanded) => {
  state.expanded = expanded
  render(<ResourceExperience recurso={viejo} categorias={[]} niveles={[]} tipos={[]} related={[]} />)
  expect(screen.getByText('Nombre original no disponible')).toBeTruthy()
  expect(screen.getByText('Fecha no registrada')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Descargar archivo' })).toBeTruthy()
})
