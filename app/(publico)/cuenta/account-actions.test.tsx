// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const mocks = vi.hoisted(() => ({ signOut: vi.fn(), replace: vi.fn() }))
vi.mock('@/lib/auth-client', () => ({ authClient: { signOut: mocks.signOut } }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace }) }))

import { AccountActions } from './account-actions'

afterEach(() => { document.body.innerHTML = '' })
beforeEach(() => { vi.clearAllMocks() })

describe('AccountActions', () => {
  it('keeps logout available on the account recovery page', async () => {
    mocks.signOut.mockResolvedValue({ data: {}, error: null })
    render(<AccountActions />)
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/login'))
  })

  it('stays on the page for a resolved error envelope and allows retry', async () => {
    mocks.signOut.mockResolvedValueOnce({ error: { status: 500 } }).mockResolvedValueOnce({ data: {}, error: null })
    render(<AccountActions />)
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cerrar la sesión')
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).not.toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/login'))
  })
})
