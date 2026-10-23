// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const changePassword = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth-client', () => ({ authClient: { changePassword } }))

import { ChangePasswordForm } from './change-password-form'

function fill(current: string, next: string, confirmation = next) {
  fireEvent.change(screen.getByLabelText('Contraseña actual'), { target: { value: current } })
  fireEvent.change(screen.getByLabelText('Nueva contraseña'), { target: { value: next } })
  fireEvent.change(screen.getByLabelText('Repita la nueva contraseña'), { target: { value: confirmation } })
}

beforeEach(() => { changePassword.mockReset() })
afterEach(() => { document.body.innerHTML = '' })

describe('ChangePasswordForm', () => {
  it('rejects a new password below the configured eight-character minimum', async () => {
    render(<ChangePasswordForm />)
    fill('old-password', 'short')
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('al menos 8 caracteres')
    expect(changePassword).not.toHaveBeenCalled()
  })

  it('shows a generic error for an invalid current password without exposing credentials', async () => {
    changePassword.mockResolvedValue({ error: { status: 400, message: 'INVALID_PASSWORD' } })
    render(<ChangePasswordForm />)
    fill('incorrect', 'new-password')
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Verifique la contraseña actual')
    expect(screen.queryByText(/incorrect|new-password|INVALID_PASSWORD/)).toBeNull()
  })

  it('provides a login link when the session expires during submission', async () => {
    changePassword.mockResolvedValue({ error: { status: 401 } })
    render(<ChangePasswordForm />)
    fill('current', 'new-password')
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }))
    expect(await screen.findByRole('link', { name: 'Iniciar sesión' })).toHaveAttribute('href', '/login')
  })

  it('preserves this session, revokes other sessions, and does not force a first-login change', async () => {
    changePassword.mockResolvedValue({ data: { token: 'rotated' }, error: null })
    render(<ChangePasswordForm />)
    expect(screen.getByText(/sigue vigente hasta que usted la cambie/)).toBeTruthy()
    fill('assigned-initial', 'replacement-password')
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Esta sesión continúa activa'))
    expect(changePassword).toHaveBeenCalledWith({
      currentPassword: 'assigned-initial', newPassword: 'replacement-password', revokeOtherSessions: true,
    })
  })
})
