// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LoginPage from './page'

const state = vi.hoisted(() => ({
  email: vi.fn(async (_cred: unknown): Promise<{ error: Error | string | null }> => ({ error: null })),
  replace: vi.fn(),
  params: {} as Record<string, string | null>,
}))

vi.mock('@/lib/auth-client', () => ({
  authClient: { signIn: { email: (cred: unknown) => state.email(cred) } },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: (to: string) => state.replace(to) }),
  useSearchParams: () => ({ get: (key: string) => state.params[key] ?? null }),
}))

vi.mock('next/link', async () => {
  const { NextLink } = await import('@/lib/test-helpers/next-link')
  return { default: NextLink }
})

beforeEach(() => {
  state.email.mockClear()
  state.replace.mockClear()
  state.params = {}
})

afterEach(() => cleanup())

describe('login page', () => {
  it('sends credentials once and routes to the preserved callback', async () => {
    state.params.callbackUrl = '/recursos/r1?from=explorar'
    render(<LoginPage />)

    fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'a@b.edu' } })
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'secret123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }))

    await waitFor(() => expect(state.email).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(state.replace).toHaveBeenCalledWith('/recursos/r1?from=explorar'))
  })

  it('disables the submit button while pending', async () => {
    let resolve!: (value: { error: Error | string | null }) => void
    state.email.mockImplementationOnce(
      () => new Promise<{ error: Error | string | null }>((done) => { resolve = done }),
    )
    render(<LoginPage />)
    fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'a@b.edu' } })
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'secret123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Ingresando…' })).toBeDisabled()
    })
    const cancel = screen.getByRole('link', { name: 'Cancelar y volver' })
    expect(cancel).toHaveAttribute('href', '/')
    resolve({ error: null })
  })

  it('keeps the intended destination on the cancel link when a callback exists', async () => {
    state.params.callbackUrl = '/tableros'
    render(<LoginPage />)
    expect(screen.getByRole('link', { name: 'Cancelar y volver' })).toHaveAttribute('href', '/tableros')
  })

  it('renders the error once and reports a failed attempt only a single time', async () => {
    state.email.mockResolvedValueOnce({ error: new Error('boom') })
    render(<LoginPage />)

    fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'a@b.edu' } })
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'secret123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('No se pudo iniciar sesión'))
    expect(state.email).toHaveBeenCalledTimes(1)
    expect(state.replace).not.toHaveBeenCalled()
  })
})