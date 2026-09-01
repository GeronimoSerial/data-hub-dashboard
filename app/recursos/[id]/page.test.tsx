import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
import type { SessionUser } from '@/lib/acl'
import type { Recurso } from '@/lib/model'
import RecursoPage from './page'

const state = vi.hoisted(() => ({
  rows: [] as Array<{ id: string }>,
  sessionUser: null as SessionUser | null,
  access: null as {
    estado: 'publicado' | 'borrador'
    audienciaNivelIds: string[]
    audienciaUserIds: string[]
  } | null,
  canOpen: true,
  catalog: null as {
    recursos: Recurso[]
    categorias: { id: string; nombre: string }[]
    niveles: { id: string; nombre: string }[]
    tipos: { id: string; nombre: string }[]
  } | null,
  redirect: vi.fn((destination: string) => {
    throw new Error(`REDIRECT:${destination}`)
  }),
  notFound: vi.fn(() => {
    throw new Error('NOT_FOUND')
  }),
  resourceExperience: vi.fn(() => null),
}))

vi.mock('next/navigation', () => ({
  redirect: state.redirect,
  notFound: state.notFound,
}))

vi.mock('@/lib/db', () => ({
  getDb: vi.fn(() => ({
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(state.rows),
      }),
    }),
  })),
}))

vi.mock('@/lib/db/seed', () => ({ ensureSeeded: vi.fn(async () => undefined) }))
vi.mock('@/lib/session', () => ({
  getSessionUser: vi.fn(async () => state.sessionUser),
}))
vi.mock('@/lib/acl', () => ({
  puedeAbrir: vi.fn(() => state.canOpen),
}))
vi.mock('@/lib/db/recurso-access', () => ({
  loadRecursoAccess: vi.fn(async () => state.access),
}))
vi.mock('@/lib/db/hub', () => ({
  loadHubCatalog: vi.fn(async () => state.catalog),
}))
vi.mock('@/components/resource-experience', () => ({
  ResourceExperience: state.resourceExperience,
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

const openAccess = {
  estado: 'publicado' as const,
  audienciaNivelIds: [],
  audienciaUserIds: [],
}

const signedIn: SessionUser = {
  id: 'u1',
  role: 'consulta',
  banned: false,
  nivelIds: [],
}

function catalogFor(recurso: Recurso = legacy) {
  return {
    recursos: [recurso],
    categorias: [{ id: 'matricula', nombre: 'Matrícula' }],
    niveles: [{ id: 'transversal', nombre: 'Transversal' }],
    tipos: [{ id: 'georref', nombre: 'Georreferencial' }],
  }
}

function renderPage(searchParams: { returnTo?: string | string[] } = {}) {
  return RecursoPage({
    params: Promise.resolve({ id: legacy.id }),
    searchParams: Promise.resolve(searchParams),
  })
}

describe('RecursoPage navigation contract', () => {
  beforeEach(() => {
    state.rows = [{ id: legacy.id }]
    state.sessionUser = signedIn
    state.access = openAccess
    state.canOpen = true
    state.catalog = catalogFor()
    vi.clearAllMocks()
  })

  it('renders a legacy ficha and CTA data without redirecting to ruta', async () => {
    const page = await renderPage({ returnTo: '/explorar?q=matrícula&tema=matricula' }) as ReactElement

    expect(state.redirect).not.toHaveBeenCalled()
    expect(page.props).toEqual(expect.objectContaining({
      recurso: legacy,
      returnTo: '/explorar?q=matrícula&tema=matricula',
    }))
  })

  it('normalizes external, empty and protocol-relative returnTo values to Explore', async () => {
    for (const value of ['', 'https://evil.example', '//evil.example']) {
      const page = await renderPage({ returnTo: value }) as ReactElement
      expect(page.props).toEqual(
        expect.objectContaining({ returnTo: '/explorar' }),
      )
    }
  })

  it('keeps anonymous users on the login callback for the ficha', async () => {
    state.sessionUser = null
    await expect(renderPage()).rejects.toThrow('REDIRECT:/login?callbackUrl=%2Frecursos%2Flegacy-1')
    expect(state.resourceExperience).not.toHaveBeenCalled()
  })

  it('keeps the ficha returnTo in the anonymous login callback', async () => {
    state.sessionUser = null
    const returnTo = '/explorar?q=matrícula&tema=trayectorias&nivel=primario'
    const callback = `/recursos/legacy-1?returnTo=${encodeURIComponent(returnTo)}`
    await expect(renderPage({ returnTo })).rejects.toThrow(
      `REDIRECT:/login?callbackUrl=${encodeURIComponent(callback)}`,
    )
    expect(state.resourceExperience).not.toHaveBeenCalled()
  })

  it('preserves the server ACL redirect for users without access', async () => {
    state.canOpen = false
    await expect(renderPage()).rejects.toThrow('REDIRECT:/forbidden')
    expect(state.resourceExperience).not.toHaveBeenCalled()
  })

  it('preserves notFound for an unknown id before authentication', async () => {
    state.rows = []
    await expect(renderPage()).rejects.toThrow('NOT_FOUND')
    expect(state.redirect).not.toHaveBeenCalled()
    expect(state.resourceExperience).not.toHaveBeenCalled()
  })
})
