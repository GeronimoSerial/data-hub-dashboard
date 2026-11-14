// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { CuadernillosWorkspace } from './workspace'

vi.mock('./cabecera/cabecera-home', () => ({
  CabeceraHome: (props: { isAdmin: boolean; readOnly: boolean; viewAsUserId?: string | null }) =>
    `Inicio de cabecera (readOnly=${props.readOnly}, viewAs=${props.viewAsUserId ?? 'none'}, admin=${props.isAdmin})`,
}))

vi.mock('./control/control-view', () => ({
  ControlView: () => 'Control de remitos',
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
        balances: [{ productId: 'book-a', productLabel: 'Cuadernillo A', globalAvailable: 10 }],
      }))
    }
    if (url.startsWith('/api/cuadernillos/remitos')) {
      return Promise.resolve(jsonResponse({ remitos: [], hasMore: false, nextCursor: null }))
    }
    if (url.startsWith('/api/cuadernillos/memberships')) return Promise.resolve(jsonResponse({ memberships: [] }))
    if (url.startsWith('/api/cuadernillos/cabeceras')) return Promise.resolve(jsonResponse({ cabeceras: [] }))
    return Promise.resolve(jsonResponse({ error: 'unexpected' }, 500))
  })
}


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
    expect(await screen.findByRole('heading', { name: 'Stock por grado' })).toBeInTheDocument()
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
    expect(screen.getByText(/Control de remitos/)).toBeInTheDocument()
  })

  it('switches between the roles the server supplied', async () => {
    const fetchMock = fetchOverview()
    vi.stubGlobal('fetch', fetchMock)

    render(<CuadernillosWorkspace capabilities={['cabecera', 'supervisor']} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Supervisión' }))

    expect(await screen.findByText(/Control de remitos/)).toBeInTheDocument()
    expect(screen.queryByText(/Inicio de cabecera/)).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/api/cuadernillos/overview'), expect.anything())
  })

  it('shows access-denied errors from the role home without rendering data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'forbidden' }, 403)))

    render(<CuadernillosWorkspace capabilities={['planning']} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('La cuenta no tiene autorización para esta operación.')
  })
})
