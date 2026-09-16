// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import PublicoLayout from './layout'

const useSession = vi.fn()

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    useSession: (...args: unknown[]) => useSession(...args),
  },
}))

describe('PublicoLayout', () => {
  it('renders without calling authClient.useSession', () => {
    render(
      <PublicoLayout>
        <p>contenido publico</p>
      </PublicoLayout>,
    )

    expect(screen.getByText(/hub de datos/i)).toBeInTheDocument()
    expect(screen.getByText('contenido publico')).toBeInTheDocument()
    expect(useSession).not.toHaveBeenCalled()
  })

  it('does not render account menu or login invitation', () => {
    render(
      <PublicoLayout>
        <p>contenido publico</p>
      </PublicoLayout>,
    )

    expect(screen.queryByRole('button', { name: /iniciar sesion/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })
})
