// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CuadernillosWorkspace } from './workspace'

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

const emptyRequestPage = { campaignId: null, campaignOptions: [], requests: [], hasMore: false, nextCursor: null }
const activeCampaign = { id: 'campaign-1', name: 'Distribución 2026', distributionEnabled: true, overassignmentAllowed: false }
function fetchWithAssignments(assignmentResponse: unknown = { items: [assignment], nextCursor: null }, status = 200) {
  return vi.fn().mockImplementation((url: string) => {
    if (url.startsWith('/api/cuadernillos/requests')) return Promise.resolve(jsonResponse(emptyRequestPage))
    if (url.startsWith('/api/cuadernillos/recommendations')) return Promise.resolve(jsonResponse({ recommendations: [{ productId: 'book-a', students: 3, suggested: 3, sourceCutId: 'cut-1' }] }))
    if (url.startsWith('/api/cuadernillos/overview')) {
      const capability = new URL(url, 'http://localhost').searchParams.get('capability') ?? 'planning'
      return Promise.resolve(jsonResponse({
        capability, campaignId: 'campaign-1', campaignOptions: [activeCampaign],
        balances: [{ productId: 'book-a', productLabel: 'Cuadernillo A', globalAvailable: capability === 'planning' ? 10 : null, quotaAssigned: null, quotaAvailable: 4, cabeceraCueAnexo: '180123000', cabeceraName: 'Cabecera' }],
        requests: [], eligibility: null, hasMore: false, nextCursor: null,
      }))
    }
    return Promise.resolve(jsonResponse(assignmentResponse, status))
  })
}

const assignment = {
  cueAnexo: '180123456',
  schoolName: 'Escuela de muestra',
  relationship: 'dependiente' as const,
  cabeceraCueAnexo: '180123000',
  supervisorName: 'Supervisión de referencia',
}

describe('CuadernillosWorkspace', () => {
  it('renders a no-capability state without attempting data reads', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    render(<CuadernillosWorkspace capabilities={[]} />)

    expect(screen.getByRole('status')).toHaveTextContent('Esta cuenta todavía no tiene una responsabilidad de cuadernillos habilitada.')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('loads the selected authorized assignment view and verified planning balances', async () => {
    const fetchMock = fetchWithAssignments()
    vi.stubGlobal('fetch', fetchMock)

    render(<CuadernillosWorkspace capabilities={['planning']} />)

    expect(screen.getByText('Cargando asignaciones…')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Escuela de muestra')).toBeInTheDocument())
    expect(fetchMock).toHaveBeenCalledWith('/api/cuadernillos/assignments?capability=planning', expect.anything())
    expect(screen.getByRole('heading', { name: 'Planeamiento' })).toBeInTheDocument()
    expect(screen.getByText(/confirmación de nuevas asignaciones está deshabilitada/i)).toBeInTheDocument()
    expect(screen.getByRole('row', { name: /Cuadernillo A.*10.*Cabecera.*4/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /aprobar/i })).not.toBeInTheDocument()
  })

  it('loads cabecera request recommendations from verified assignments', async () => {
    vi.stubGlobal('fetch', fetchWithAssignments())

    render(<CuadernillosWorkspace capabilities={['cabecera']} />)

    await waitFor(() => expect(screen.getByText('Escuela de muestra')).toBeInTheDocument())
    expect(screen.getByRole('heading', { name: 'Cabecera' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Escuela destinataria'), { target: { value: '180123456' } })
    expect(await screen.findByText(/Recomendación: 3 · matrícula: 3/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enviar a revisión' })).toBeInTheDocument()
  })

  it('shows an honest empty state when no assignments are linked', async () => {
    vi.stubGlobal('fetch', fetchWithAssignments({ items: [], nextCursor: null }))

    render(<CuadernillosWorkspace capabilities={['cabecera']} />)

    expect(await screen.findByText('Todavía no hay escuelas asignadas a esta cuenta.')).toBeInTheDocument()
  })

  it('never offers individual or bulk approval before request reads and approval services exist', async () => {
    vi.stubGlobal('fetch', fetchWithAssignments())

    render(<CuadernillosWorkspace capabilities={['supervisor']} />)

    await waitFor(() => expect(screen.getByText('Escuela de muestra')).toBeInTheDocument())
    expect(screen.getByRole('heading', { name: 'Supervisión' })).toBeInTheDocument()
    expect(screen.getByText(/decisiones sobre solicitudes todavía no disponibles/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /aprobar|rechazar|firmar/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /aprobar todas/i })).not.toBeInTheDocument()
  })

  it('allows switching only among capabilities supplied by the server', async () => {
    const fetchMock = fetchWithAssignments()
    vi.stubGlobal('fetch', fetchMock)

    render(<CuadernillosWorkspace capabilities={['cabecera', 'supervisor']} />)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Cabecera' })).toBeInTheDocument())

    expect(screen.getByRole('button', { name: 'Cabecera' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Supervisión' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Planeamiento' })).not.toBeInTheDocument()
    screen.getByRole('button', { name: 'Supervisión' }).click()
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Supervisión' })).toBeInTheDocument())
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/cuadernillos/assignments?capability=supervisor', expect.anything()))
  })

  it('shows access-denied errors without rendering assignment data', async () => {
    vi.stubGlobal('fetch', fetchWithAssignments({ error: 'No tiene acceso a este recurso' }, 403))

    render(<CuadernillosWorkspace capabilities={['supervisor']} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('No tiene acceso a este recurso')
    expect(screen.queryByText('Escuela de muestra')).not.toBeInTheDocument()
  })

  it('rejects malformed assignment responses instead of rendering untrusted data', async () => {
    vi.stubGlobal('fetch', fetchWithAssignments({
      items: [{ schoolName: 'Unvalidated school', email: 'private@example.test' }],
      nextCursor: null,
    }))

    render(<CuadernillosWorkspace capabilities={['cabecera']} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('La respuesta de asignaciones no tiene un formato válido.')
    expect(screen.queryByText('Unvalidated school')).not.toBeInTheDocument()
    expect(screen.queryByText('private@example.test')).not.toBeInTheDocument()
  })
})

describe('CuadernillosWorkspace view-as', () => {
  const target = { userId: 'supervisor-1', name: 'Supervisora Demo' }
  const candidate = { userId: 'supervisor-1', name: 'Supervisora Demo', email: 'sup@example.test', capabilities: ['supervisor' as const] }

  it('shows a read-only banner with an exit link and sends viewAs with every read', async () => {
    const fetchMock = fetchWithAssignments()
    vi.stubGlobal('fetch', fetchMock)

    render(<CuadernillosWorkspace capabilities={['planning']} viewAs={target} />)

    expect(screen.getByText('Viendo como Supervisora Demo (Planeamiento) — solo lectura')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Salir' })).toHaveAttribute('href', '/cuadernillos')
    await waitFor(() => expect(screen.getByText('Escuela de muestra')).toBeInTheDocument())
    expect(fetchMock).toHaveBeenCalledWith('/api/cuadernillos/assignments?capability=planning&viewAs=supervisor-1', expect.anything())
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/cuadernillos/overview?capability=planning&viewAs=supervisor-1'), expect.anything())
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/cuadernillos/requests?'), expect.anything())
  })

  it('disables write actions while viewing as another account', async () => {
    vi.stubGlobal('fetch', fetchWithAssignments())

    render(<CuadernillosWorkspace capabilities={['planning']} viewAs={target} />)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Registrar movimiento' })).toBeDisabled())
    expect(screen.getByRole('button', { name: 'Guardar cupo' })).toBeDisabled()
  })

  it('does not offer membership administration while viewing as another account', async () => {
    vi.stubGlobal('fetch', fetchWithAssignments())

    render(<CuadernillosWorkspace capabilities={['planning']} isAdmin viewAs={target} viewAsCandidates={[candidate]} />)

    await waitFor(() => expect(screen.getByText('Escuela de muestra')).toBeInTheDocument())
    expect(document.getElementById('membership-admin-title')).toBeNull()
  })

  it('keeps membership administration for an admin working as themselves', async () => {
    const base = fetchWithAssignments()
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => url.startsWith('/api/cuadernillos/memberships')
      ? Promise.resolve(jsonResponse({ memberships: [] }))
      : base(url)))

    render(<CuadernillosWorkspace capabilities={['planning']} isAdmin />)

    await waitFor(() => expect(document.getElementById('membership-admin-title')).not.toBeNull())
  })

  it('shows the admin account picker only to admins and never a native select', async () => {
    vi.stubGlobal('fetch', fetchWithAssignments())

    const { container, rerender } = render(<CuadernillosWorkspace capabilities={['planning']} isAdmin viewAsCandidates={[candidate]} />)
    expect(screen.getByRole('searchbox', { name: 'Buscar cuenta' })).toBeInTheDocument()
    expect(container.querySelector('select')).toBeNull()

    rerender(<CuadernillosWorkspace capabilities={['planning']} viewAsCandidates={[candidate]} />)
    expect(screen.queryByRole('searchbox', { name: 'Buscar cuenta' })).not.toBeInTheDocument()
  })

  it('explains when the requested account cannot be viewed', async () => {
    vi.stubGlobal('fetch', fetchWithAssignments())

    render(<CuadernillosWorkspace capabilities={['planning']} isAdmin viewAsUnavailable viewAsCandidates={[candidate]} />)

    expect(screen.getByRole('alert')).toHaveTextContent('No se puede ver como esta cuenta.')
  })
})
