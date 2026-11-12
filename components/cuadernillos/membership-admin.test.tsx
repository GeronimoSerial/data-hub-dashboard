// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MembershipAdmin } from './membership-admin'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const activeMembership = {
  id: 'membership-1',
  userId: 'user-1',
  userName: 'Ana Pérez',
  userEmail: 'ana@example.test',
  capability: 'planning' as const,
  grantedByUserId: 'admin-1',
  grantedAt: '2026-11-01T12:00:00.000Z',
  revokedAt: null,
}

function response(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

describe('MembershipAdmin', () => {
  it('lists active memberships with their capability and a revoke action', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ memberships: [activeMembership] })))

    render(<MembershipAdmin />)

    const row = await screen.findByRole('row', { name: /Ana Pérez.*Planeamiento/ })
    expect(within(row).getByRole('button', { name: /Revocar/ })).toBeInTheDocument()
  })

  it('revokes a membership through DELETE and removes it from the table', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ memberships: [activeMembership] }))
      .mockResolvedValueOnce(response({ membership: { ...activeMembership, revokedAt: '2026-11-11T10:00:00.000Z' } }))
      .mockResolvedValueOnce(response({ memberships: [] }))
    vi.stubGlobal('fetch', fetchMock)

    render(<MembershipAdmin />)
    fireEvent.click(await screen.findByRole('button', { name: /Revocar/ }))

    await waitFor(() => expect(screen.queryByRole('row', { name: /Ana Pérez/ })).not.toBeInTheDocument())
    expect(fetchMock).toHaveBeenCalledWith('/api/cuadernillos/memberships/membership-1', expect.objectContaining({ method: 'DELETE' }))
  })

  it('searches users, then grants the chosen capability to the chosen account', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ memberships: [] }))
      .mockResolvedValueOnce(response({ users: [{ id: 'user-2', name: 'Bruno', email: 'bruno@example.test' }] }))
      .mockResolvedValueOnce(response({ membership: { ...activeMembership, id: 'membership-2', userId: 'user-2', userName: 'Bruno', userEmail: 'bruno@example.test', capability: 'supervisor' } }, 201))
      .mockResolvedValueOnce(response({ memberships: [] }))
    vi.stubGlobal('fetch', fetchMock)

    render(<MembershipAdmin />)
    await screen.findByText(/Sin asignaciones activas/)

    fireEvent.change(screen.getByLabelText(/Buscar usuario/), { target: { value: 'bru' } })
    fireEvent.click(screen.getByRole('button', { name: /^Buscar$/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Bruno.*bruno@example.test/ }))
    fireEvent.click(screen.getByRole('radio', { name: 'Supervisor' }))
    fireEvent.click(screen.getByRole('button', { name: /Otorgar/ }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/cuadernillos/memberships?q=bru',
      expect.anything(),
    ))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/cuadernillos/memberships',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ userId: 'user-2', capability: 'supervisor' }),
      }),
    ))
  })

  it('shows a Spanish message as an alert when a grant is refused', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ memberships: [] }))
      .mockResolvedValueOnce(response({ users: [{ id: 'user-2', name: 'Bruno', email: 'bruno@example.test' }] }))
      .mockResolvedValueOnce(response({ error: 'user_banned' }, 409))
    vi.stubGlobal('fetch', fetchMock)

    render(<MembershipAdmin />)
    await screen.findByText(/Sin asignaciones activas/)
    fireEvent.change(screen.getByLabelText(/Buscar usuario/), { target: { value: 'bru' } })
    fireEvent.click(screen.getByRole('button', { name: /^Buscar$/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Bruno/ }))
    fireEvent.click(screen.getByRole('button', { name: /Otorgar/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('La cuenta está deshabilitada y no puede recibir permisos.')
  })
})
