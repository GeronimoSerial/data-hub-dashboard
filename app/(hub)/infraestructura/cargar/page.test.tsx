// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { getSessionUser, redirect } = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`) }),
}))

vi.mock('@/lib/session', () => ({ getSessionUser }))
vi.mock('next/navigation', () => ({ redirect }))
vi.mock('@/lib/db', () => ({ getRawClient: vi.fn() }))
vi.mock('@/lib/infraestructura/ge-db', () => ({
  ensureGeSchema: vi.fn(),
  crearEjecutorSql: vi.fn(),
}))
vi.mock('@/lib/infraestructura/localizaciones-seed', () => ({ ensureLocalizacionesSeeded: vi.fn() }))
vi.mock('@/lib/infraestructura/contexto', () => ({
  resolverContextoPorCue: vi.fn(async () => ({
    ok: true,
    contexto: { escuela: { nombre: 'Escuela 4', cueAnexo: '1801605-04', localidad: 'Paraná', departamento: 'Capital' } },
  })),
}))

import CargarParteEscuelaPage from './page'

describe('CargarParteEscuelaPage', () => {
  afterEach(() => cleanup())

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('redirige a login si no hay sesión', async () => {
    getSessionUser.mockResolvedValue(null)

    await expect(CargarParteEscuelaPage({ searchParams: Promise.resolve({}) }))
      .rejects.toThrow('REDIRECT:/login?callbackUrl=/infraestructura/cargar')
  })

  it('explica que se necesita la contraseña compartida', async () => {
    getSessionUser.mockResolvedValue({ role: 'user', banned: false })

    render(await CargarParteEscuelaPage({ searchParams: Promise.resolve({ cue: '1801605-04' }) }))

    expect(screen.getByRole('note')).toHaveTextContent(/contraseña de acceso compartida/i)
    expect(screen.getByRole('note')).toHaveTextContent(/téngala a mano/i)
  })

  it('indica que el administrador puede ingresar sin contraseña', async () => {
    getSessionUser.mockResolvedValue({ role: 'admin', banned: false })

    render(await CargarParteEscuelaPage({ searchParams: Promise.resolve({ cue: '1801605-04' }) }))

    expect(screen.getByRole('note')).toHaveTextContent(/como administrador/i)
    expect(screen.queryByText(/solicitará la contraseña/i)).not.toBeInTheDocument()
  })
})
