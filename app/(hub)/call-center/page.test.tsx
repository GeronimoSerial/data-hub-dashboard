// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { getSessionUser, getShellUser, redirect } = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  getShellUser: vi.fn(),
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`) }),
}))

vi.mock('@/lib/session', () => ({ getSessionUser, getShellUser }))
vi.mock('next/navigation', () => ({ redirect }))
vi.mock('@/components/call-center/lista-escuelas', () => ({
  ListaEscuelas: ({ callerNombreInicial }: { callerNombreInicial: string }) => (
    <div data-testid="lista-escuelas">{callerNombreInicial}</div>
  ),
}))

import CallCenterPage from './page'

describe('CallCenterPage', () => {
  afterEach(() => cleanup())

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('redirige a login si no hay sesión', async () => {
    getSessionUser.mockResolvedValue(null)

    await expect(CallCenterPage()).rejects.toThrow('REDIRECT:/login?callbackUrl=/call-center')
  })

  it('redirige a forbidden si el usuario no tiene acceso al call center', async () => {
    getSessionUser.mockResolvedValue({ role: 'consulta', banned: false })

    await expect(CallCenterPage()).rejects.toThrow('REDIRECT:/forbidden')
  })

  it('permite a un administrador de Gestión (admin_ge)', async () => {
    getSessionUser.mockResolvedValue({ role: 'admin_ge', banned: false })
    getShellUser.mockResolvedValue({ name: 'Ana GE', role: 'admin_ge' })

    render(await CallCenterPage())

    expect(screen.getByRole('heading', { name: 'Call center' })).toBeInTheDocument()
  })

  it('renderiza el título y la lista para un admin', async () => {
    getSessionUser.mockResolvedValue({ role: 'admin', banned: false })
    getShellUser.mockResolvedValue({ name: 'Ana Operadora', role: 'admin' })

    render(await CallCenterPage())

    expect(screen.getByRole('heading', { name: 'Call center' })).toBeInTheDocument()
    expect(screen.getByText('Escuelas con el parte sin actualizar por más de 72 horas.')).toBeInTheDocument()
    expect(screen.getByTestId('lista-escuelas')).toHaveTextContent('Ana Operadora')
  })
})
