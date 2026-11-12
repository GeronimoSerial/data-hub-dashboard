// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Configuracion } from './configuracion'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function response(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

const cabeceras = [
  { cue: '180017000', nombre: 'ESCUELA Nº 87', departamento: 'MERCEDES', supervisorName: 'MILAGROS GONZALEZ', evidencia: 'x', status: 'pendiente', supervisor: null, cabecera: null },
  { cue: '180032400', nombre: 'ESCUELA Nº 38', departamento: 'CURUZU CUATIA', supervisorName: 'EDID LEYES', evidencia: 'y', status: 'pendiente', supervisor: null, cabecera: null },
]

function stubCabeceraApi() {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/cuadernillos/cabeceras' && init?.method !== 'POST') {
      return new Response(JSON.stringify({ cabeceras }), { status: 200 })
    }
    if (url.startsWith('/api/cuadernillos/memberships?q=')) {
      const term = decodeURIComponent(url.split('q=')[1])
      const user = term === 'mili'
        ? { id: 'sup-1', name: 'Milagros González', email: 'mili@example.test' }
        : { id: 'cab-1', name: 'Directora 87', email: 'dir87@example.test' }
      return new Response(JSON.stringify({ users: [user] }), { status: 200 })
    }
    if (url === '/api/cuadernillos/cabeceras' && init?.method === 'POST') {
      return new Response(JSON.stringify({ confirmed: ['180017000'], unchanged: [], blocked: [] }), { status: 200 })
    }
    if (url === '/api/cuadernillos/memberships') return new Response(JSON.stringify({ memberships: [] }), { status: 200 })
    return new Response(JSON.stringify({ error: 'unexpected' }), { status: 500 })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function pick(term: string, name: RegExp, slotIndex: number) {
  fireEvent.click(screen.getAllByRole('button', { name: /Sin asignar/ })[slotIndex])
  fireEvent.change(screen.getByPlaceholderText('Nombre o correo'), { target: { value: term } })
  fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
  fireEvent.click(await screen.findByRole('button', { name }))
}

describe('Configuracion · Cabeceras', () => {
  it('lists the cabeceras and posts the chosen account pair for a cabecera', async () => {
    const fetchMock = stubCabeceraApi()
    render(<Configuracion />)

    expect(await screen.findByText('ESCUELA Nº 87')).toBeTruthy()
    expect(screen.getByText('MILAGROS GONZALEZ')).toBeTruthy()

    await pick('mili', /Milagros González/, 0)
    await pick('dir', /Directora 87/, 0)

    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true))
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!
    expect(JSON.parse(String(post[1]?.body))).toEqual({
      mapping: { '180017000': { supervisorUserId: 'sup-1', cabeceraUserId: 'cab-1' } },
    })
  })
})

function membershipFetch(...queued: unknown[]) {
  const pending = [...queued]
  return vi.fn().mockImplementation((url: string) => Promise.resolve(
    url === '/api/cuadernillos/cabeceras' ? response({ cabeceras: [] }) : pending.shift(),
  ))
}

describe('Configuracion · Membresías', () => {
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

  async function openMemberships() {
    fireEvent.click(screen.getByRole('button', { name: 'Membresías' }))
  }

  it('lists active memberships with their capability and a revoke action', async () => {
    vi.stubGlobal('fetch', membershipFetch(response({ memberships: [activeMembership] })))

    render(<Configuracion />)
    await openMemberships()

    const row = await screen.findByRole('row', { name: /Ana Pérez.*Planeamiento/ })
    expect(within(row).getByRole('button', { name: /Revocar/ })).toBeInTheDocument()
  })

  it('revokes a membership through DELETE and removes it from the table', async () => {
    const fetchMock = membershipFetch(
      response({ memberships: [activeMembership] }),
      response({ membership: { ...activeMembership, revokedAt: '2026-11-11T10:00:00.000Z' } }),
      response({ memberships: [] }),
    )
    vi.stubGlobal('fetch', fetchMock)

    render(<Configuracion />)
    await openMemberships()
    fireEvent.click(await screen.findByRole('button', { name: /Revocar/ }))

    await waitFor(() => expect(screen.queryByRole('row', { name: /Ana Pérez/ })).not.toBeInTheDocument())
    expect(fetchMock).toHaveBeenCalledWith('/api/cuadernillos/memberships/membership-1', expect.objectContaining({ method: 'DELETE' }))
  })

  it('searches users, then grants the chosen capability to the chosen account', async () => {
    const fetchMock = membershipFetch(
      response({ memberships: [] }),
      response({ users: [{ id: 'user-2', name: 'Bruno', email: 'bruno@example.test' }] }),
      response({ membership: { ...activeMembership, id: 'membership-2' } }, 201),
      response({ memberships: [] }),
    )
    vi.stubGlobal('fetch', fetchMock)

    render(<Configuracion />)
    await openMemberships()
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
    vi.stubGlobal('fetch', membershipFetch(
      response({ memberships: [] }),
      response({ users: [{ id: 'user-2', name: 'Bruno', email: 'bruno@example.test' }] }),
      response({ error: 'user_banned' }, 409),
    ))

    render(<Configuracion />)
    await openMemberships()
    await screen.findByText(/Sin asignaciones activas/)
    fireEvent.change(screen.getByLabelText(/Buscar usuario/), { target: { value: 'bru' } })
    fireEvent.click(screen.getByRole('button', { name: /^Buscar$/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Bruno/ }))
    fireEvent.click(screen.getByRole('button', { name: /Otorgar/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('La cuenta está deshabilitada y no puede recibir permisos.')
  })
})
