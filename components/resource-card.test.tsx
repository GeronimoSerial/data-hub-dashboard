// @vitest-environment jsdom
import * as React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Recurso } from '@/lib/model'
import { ResourceCard } from './resource-card'

const state = vi.hoisted(() => ({
  session: { isPending: false, data: { user: { id: 'u1' } as { id: string } | undefined } },
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
    React.createElement('a', { ...props, href }, children),
}))
vi.mock('@/components/hub-data', () => ({
  useHubData: () => ({
    niveles: [{ id: 'transversal', nombre: 'Transversal' }],
    categorias: [{ id: 'matricula', nombre: 'Matrícula' }],
  }),
}))
vi.mock('@/lib/auth-client', () => ({
  authClient: { useSession: () => state.session },
}))

const legacy: Recurso = {
  id: 'legacy-1',
  titulo: 'Mapa legacy',
  descripcion: 'Descripción',
  formato: 'mapa',
  nivelId: 'transversal',
  tipoId: 'georref',
  categoriaId: 'matricula',
  tagIds: [],
  area: 'Área',
  actualizado: '2026-08-01',
  estado: 'publicado',
  ruta: '/mapas/matricula',
}

describe('ResourceCard canonical navigation', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('points legacy cards to the ficha and preserves Explore filters', () => {
    render(<ResourceCard recurso={legacy} returnTo="/explorar?q=mapa&formato=mapa" />)
    expect(screen.getByRole('link', { name: /mapa legacy/i })).toHaveAttribute(
      'href',
      `/recursos/legacy-1?returnTo=${encodeURIComponent('/explorar?q=mapa&formato=mapa')}`,
    )
  })

  it('sends anonymous users to login with the canonical ficha callback', () => {
    state.session = { isPending: false, data: { user: undefined } }
    render(<ResourceCard recurso={legacy} returnTo="/explorar?tema=matricula" />)
    expect(screen.getByRole('link', { name: /mapa legacy/i })).toHaveAttribute(
      'href',
      `/login?callbackUrl=${encodeURIComponent(`/recursos/legacy-1?returnTo=${encodeURIComponent('/explorar?tema=matricula')}`)}`,
    )
  })
})
