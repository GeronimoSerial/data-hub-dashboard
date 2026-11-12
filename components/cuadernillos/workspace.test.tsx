// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CuadernillosWorkspace } from './workspace'

vi.mock('./cabecera/cabecera-home', () => ({
  CabeceraHome: (props: { isAdmin: boolean; readOnly: boolean; viewAsUserId?: string | null }) =>
    `Inicio de cabecera (readOnly=${props.readOnly}, viewAs=${props.viewAsUserId ?? 'none'}, admin=${props.isAdmin})`,
}))

vi.mock('./supervisor/supervisor-inbox', () => ({
  SupervisorInbox: (props: { isAdmin: boolean; readOnly: boolean; viewAsUserId?: string | null }) =>
    `Bandeja de supervisión (readOnly=${props.readOnly}, viewAs=${props.viewAsUserId ?? 'none'})`,
}))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }
}

const activeCampaign = { id: 'campaign-1', name: 'Distribución 2026', distributionEnabled: true, overassignmentAllowed: false }

function fetchOverview() {
  return vi.fn().mockImplementation((url: string) => {
    if (url.startsWith('/api/cuadernillos/overview')) {
      return Promise.resolve(jsonResponse({
        capability: 'planning', campaignId: 'campaign-1', campaignOptions: [activeCampaign],
        balances: [{ productId: 'book-a', productLabel: 'Cuadernillo A', globalAvailable: 10, quotaAssigned: null, quotaAvailable: 4, cabeceraCueAnexo: '180123000', cabeceraName: 'Cabecera' }],
        requests: [], eligibility: null, hasMore: false, nextCursor: null,
      }))
    }
    if (url.startsWith('/api/cuadernillos/memberships')) return Promise.resolve(jsonResponse({ memberships: [] }))
    if (url.startsWith('/api/cuadernillos/cabeceras')) return Promise.resolve(jsonResponse({ cabeceras: [] }))
    return Promise.resolve(jsonResponse({ error: 'unexpected' }, 500))
  })
}

const target = { userId: 'supervisor-1', name: 'Supervisora Demo' }
const candidate = { userId: 'supervisor-1', name: 'Supervisora Demo', email: 'sup@example.test', capabilities: ['supervisor' as const] }

describe('CuadernillosWorkspace roles', () => {
  it('renders a no-capability state without attempting data reads', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    render(<CuadernillosWorkspace capabilities={[]} />)

    expect(screen.getByRole('status')).toHaveTextContent('Esta cuenta todavía no tiene una responsabilidad de cuadernillos habilitada.')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows the planning home for a planning-only account without a role switch', async () => {
    vi.stubGlobal('fetch', fetchOverview())

    render(<CuadernillosWorkspace capabilities={['planning']} />)

    expect(screen.getByRole('heading', { name: 'Cuadernillos' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Registrar stock global' })).toBeInTheDocument()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  })

  it('defaults to the most specific role the user has and offers only those roles', () => {
    vi.stubGlobal('fetch', fetchOverview())

    render(<CuadernillosWorkspace capabilities={['planning', 'cabecera', 'supervisor']} />)

    expect(screen.getByRole('tab', { name: 'Cabecera' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Supervisión' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Planeamiento' })).toBeInTheDocument()
    expect(screen.getByText(/Inicio de cabecera/)).toBeInTheDocument()
  })

  it('defaults a supervisor-and-planning account to supervision and hides roles it lacks', () => {
    vi.stubGlobal('fetch', fetchOverview())

    render(<CuadernillosWorkspace capabilities={['planning', 'supervisor']} />)

    expect(screen.getByRole('tab', { name: 'Supervisión' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByRole('tab', { name: 'Cabecera' })).not.toBeInTheDocument()
    expect(screen.getByText(/Bandeja de supervisión/)).toBeInTheDocument()
  })

  it('switches between the roles the server supplied', async () => {
    const fetchMock = fetchOverview()
    vi.stubGlobal('fetch', fetchMock)

    render(<CuadernillosWorkspace capabilities={['cabecera', 'supervisor']} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Supervisión' }))

    expect(await screen.findByText(/Bandeja de supervisión/)).toBeInTheDocument()
    expect(screen.queryByText(/Inicio de cabecera/)).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/api/cuadernillos/overview'), expect.anything())
  })

  it('shows every role and the configuration area to an admin', async () => {
    vi.stubGlobal('fetch', fetchOverview())

    render(<CuadernillosWorkspace capabilities={['planning', 'cabecera', 'supervisor']} isAdmin />)

    fireEvent.click(screen.getByRole('tab', { name: 'Planeamiento' }))
    expect(screen.getByRole('tab', { name: 'Planeamiento' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Cabecera' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Supervisión' })).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: 'Configuración' }))
    expect(await screen.findByRole('heading', { name: 'Configuración' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Membresías' })).toBeInTheDocument()
  })

  it('offers no configuration area to a non-admin planner', async () => {
    vi.stubGlobal('fetch', fetchOverview())

    render(<CuadernillosWorkspace capabilities={['planning']} />)

    await screen.findByRole('heading', { name: 'Registrar stock global' })
    expect(screen.queryByRole('button', { name: 'Configuración' })).not.toBeInTheDocument()
  })

  it('shows access-denied errors from the role home without rendering data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'forbidden' }, 403)))

    render(<CuadernillosWorkspace capabilities={['planning']} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('La cuenta no tiene autorización para esta operación.')
  })
})

describe('CuadernillosWorkspace view-as', () => {
  it('shows the view-as selector only to admins and never a native select', () => {
    vi.stubGlobal('fetch', fetchOverview())

    const { container, rerender } = render(<CuadernillosWorkspace capabilities={['planning']} isAdmin viewAsCandidates={[candidate]} />)
    fireEvent.click(screen.getByRole('button', { name: /Ver como/ }))
    expect(screen.getByRole('searchbox', { name: 'Buscar cuenta' })).toBeInTheDocument()
    expect(container.querySelector('select')).toBeNull()

    rerender(<CuadernillosWorkspace capabilities={['planning']} viewAsCandidates={[candidate]} />)
    expect(screen.queryByRole('button', { name: /Ver como/ })).not.toBeInTheDocument()
  })

  it('shows a read-only banner with an exit link while viewing another account', async () => {
    vi.stubGlobal('fetch', fetchOverview())

    render(<CuadernillosWorkspace capabilities={['planning']} viewAs={target} />)

    expect(screen.getByText('Viendo como Supervisora Demo (Planeamiento) — solo lectura').closest('[role="status"]')).not.toBeNull()
    expect(screen.getByRole('link', { name: 'Salir' })).toHaveAttribute('href', '/cuadernillos')
  })

  it('passes the viewed account and read-only flag to the role home', async () => {
    vi.stubGlobal('fetch', fetchOverview())

    render(<CuadernillosWorkspace capabilities={['cabecera']} viewAs={target} isAdmin />)

    expect(await screen.findByText('Inicio de cabecera (readOnly=true, viewAs=supervisor-1, admin=true)')).toBeInTheDocument()
  })

  it('disables planning write controls while viewing as another account', async () => {
    const fetchMock = fetchOverview()
    vi.stubGlobal('fetch', fetchMock)

    render(<CuadernillosWorkspace capabilities={['planning']} viewAs={target} />)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Registrar movimiento' })).toBeDisabled())
    expect(screen.getByRole('button', { name: 'Guardar cupo' })).toBeDisabled()
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/cuadernillos/overview?capability=planning&viewAs=supervisor-1'), expect.anything())
  })

  it('hides configuration while viewing as another account, even for an admin', async () => {
    vi.stubGlobal('fetch', fetchOverview())

    render(<CuadernillosWorkspace capabilities={['planning']} isAdmin viewAs={target} viewAsCandidates={[candidate]} />)

    await screen.findByRole('heading', { name: 'Registrar stock global' })
    expect(screen.queryByRole('button', { name: 'Configuración' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Configuración' })).not.toBeInTheDocument()
  })

  it('explains when the requested account cannot be viewed', () => {
    vi.stubGlobal('fetch', fetchOverview())

    render(<CuadernillosWorkspace capabilities={['planning']} isAdmin viewAsUnavailable viewAsCandidates={[candidate]} />)

    expect(screen.getByRole('alert')).toHaveTextContent('No se puede ver como esta cuenta.')
  })
})
