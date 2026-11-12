// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CabeceraHome } from './cabecera-home'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const assignments = {
  items: [{ cueAnexo: '180123456', schoolName: 'Escuela Cabecera', relationship: 'cabecera', cabeceraCueAnexo: '180123456', supervisorName: 'Supervisora' }],
  nextCursor: null,
}
const emptyRequests = { campaignId: 'campaign-1', campaignOptions: [{ id: 'campaign-1', name: 'Campaña 2026', distributionEnabled: true, overassignmentAllowed: false }], requests: [], hasMore: false, nextCursor: null }

function json(body: unknown, ok = true) {
  return { ok, json: async () => body }
}

function overviewFor(cabeceraCue: string, cabeceraName: string) {
  return json({ campaignId: 'campaign-1', campaignOptions: [], balances: [
    { productId: 'product-1', productLabel: 'Cuadernillo A', globalAvailable: 100, quotaAssigned: 50, quotaAvailable: 50, cabeceraCueAnexo: cabeceraCue, cabeceraName },
  ] })
}

function schoolsResponse() {
  return json({ schools: [{ cueAnexo: '180123457', nombre: 'Escuela Critica', departamento: 'CAPITAL', severity: 'Crítica' }] })
}

/** Routes the cabecera endpoints used by CabeceraHome; `overrides` replaces a route by URL prefix. */
function routeFetch(overrides: Record<string, () => unknown> = {}) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const key = Object.keys(overrides).find((prefix) => url.startsWith(prefix))
    if (key) return overrides[key]()
    if (url.startsWith('/api/cuadernillos/assignments')) return json(assignments)
    if (url.startsWith('/api/cuadernillos/overview')) return overviewFor('180123456', 'Escuela Cabecera')
    if (url.startsWith('/api/cuadernillos/schools')) return schoolsResponse()
    if (url.startsWith('/api/cuadernillos/recommendations')) return json({ recommendations: [{ productId: 'product-1', students: 12, suggested: 12, sourceCutId: 'cut-1' }] })
    if (url.startsWith('/api/cuadernillos/requests') && init?.method !== 'POST') return json(emptyRequests)
    if (url === '/api/cuadernillos/requests' && init?.method === 'POST') return json({ request: { requestId: 'req-1', status: 'pending' } })
    return json({})
  })
}

describe('CabeceraHome request flow', () => {
  it('searches critical schools by CUE and only offers the ones the endpoint returns', async () => {
    const fetchMock = routeFetch()
    vi.stubGlobal('fetch', fetchMock)

    render(<CabeceraHome isAdmin={false} readOnly={false} viewAsUserId={null} />)

    fireEvent.change(await screen.findByLabelText('CUE de la escuela'), { target: { value: '180123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar escuela' }))

    expect(await screen.findByText('Escuela Critica')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem').filter((item) => item.textContent?.includes('Escuela Critica'))).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/cuadernillos/schools?cue=180123', expect.anything())
  })

  it('asks the server for recommendations scoped to the requesting cabecera cue', async () => {
    const fetchMock = routeFetch()
    vi.stubGlobal('fetch', fetchMock)

    render(<CabeceraHome isAdmin={false} readOnly={false} viewAsUserId={null} />)
    fireEvent.change(await screen.findByLabelText('CUE de la escuela'), { target: { value: '180123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar escuela' }))
    fireEvent.click(await screen.findByRole('button', { name: /Elegir Escuela Critica/ }))

    await waitFor(() => expect(screen.getByLabelText(/Cantidad · Cuadernillo A/)).toHaveValue(12))
    const recommendationUrl = fetchMock.mock.calls.map(([url]) => String(url)).find((url) => url.startsWith('/api/cuadernillos/recommendations'))
    expect(recommendationUrl).toContain('cueAnexo=180123457')
    expect(recommendationUrl).toContain('cabeceraCueAnexo=180123456')
  })

  it('does not read the admin cabecera picker for a non-admin account', async () => {
    const fetchMock = routeFetch()
    vi.stubGlobal('fetch', fetchMock)

    render(<CabeceraHome isAdmin={false} readOnly={false} viewAsUserId={null} />)
    await screen.findByLabelText('CUE de la escuela')

    expect(fetchMock.mock.calls.some(([url]) => String(url) === '/api/cuadernillos/cabeceras')).toBe(false)
  })

  it('submits the same body the cabecera request form posted, with a retry key', async () => {
    const fetchMock = routeFetch()
    vi.stubGlobal('fetch', fetchMock)

    render(<CabeceraHome isAdmin={false} readOnly={false} viewAsUserId={null} />)
    fireEvent.change(await screen.findByLabelText('CUE de la escuela'), { target: { value: '180123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar escuela' }))
    fireEvent.click(await screen.findByRole('button', { name: /Elegir Escuela Critica/ }))
    await waitFor(() => expect(screen.getByLabelText(/Cantidad · Cuadernillo A/)).toHaveValue(12))
    fireEvent.click(screen.getByRole('button', { name: 'Enviar pedido' }))

    expect(await screen.findByText(/Pedido enviado a revisión para Escuela Critica/)).toBeInTheDocument()
    const requestCall = fetchMock.mock.calls.find(([url, init]) => url === '/api/cuadernillos/requests' && init?.method === 'POST')
    expect(JSON.parse(requestCall?.[1]?.body as string)).toMatchObject({
      campaignId: 'campaign-1',
      recipientCueAnexo: '180123457',
      cabeceraCueAnexo: '180123456',
      lines: [{ productId: 'product-1', quantity: 12 }],
      submit: true,
    })
    expect(JSON.parse(requestCall?.[1]?.body as string).idempotencyKey).toEqual(expect.any(String))
  })

  it('disables every write in read-only mode while keeping the flow visible', async () => {
    const fetchMock = routeFetch()
    vi.stubGlobal('fetch', fetchMock)

    render(<CabeceraHome isAdmin={false} readOnly viewAsUserId="user-2" />)
    fireEvent.change(await screen.findByLabelText('CUE de la escuela'), { target: { value: '180123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar escuela' }))
    fireEvent.click(await screen.findByRole('button', { name: /Elegir Escuela Critica/ }))
    await waitFor(() => expect(screen.getByLabelText(/Cantidad · Cuadernillo A/)).toHaveValue(12))

    expect(screen.getByRole('button', { name: 'Enviar pedido' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Guardar borrador' })).toBeDisabled()
    expect(screen.getByText(/solo lectura/i)).toBeInTheDocument()
  })

  it('requires an admin to choose the cabecera and sends its cue with the request', async () => {
    const cabeceras = { cabeceras: [{ cue: '180123000', nombre: 'Escuela Cabecera Norte', departamento: 'CAPITAL', supervisorName: 'Supervisora', evidencia: 'hoja', status: 'confirmada', supervisor: null, cabecera: null }] }
    const fetchMock = routeFetch({
      '/api/cuadernillos/cabeceras': () => json(cabeceras),
      '/api/cuadernillos/overview': () => overviewFor('180123000', 'Escuela Cabecera Norte'),
      '/api/cuadernillos/recommendations': () => json({ recommendations: [{ productId: 'product-1', students: 12, suggested: 12, sourceCutId: 'cut-1' }] }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<CabeceraHome isAdmin readOnly={false} viewAsUserId={null} />)

    expect(await screen.findByText(/Elegí la cabecera/)).toBeInTheDocument()
    expect(screen.queryByLabelText('CUE de la escuela')).not.toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: /Escuela Cabecera Norte/ }))
    fireEvent.change(await screen.findByLabelText('CUE de la escuela'), { target: { value: '180123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar escuela' }))
    fireEvent.click(await screen.findByRole('button', { name: /Elegir Escuela Critica/ }))
    await waitFor(() => expect(screen.getByLabelText(/Cantidad · Cuadernillo A/)).toHaveValue(12))
    fireEvent.click(screen.getByRole('button', { name: 'Enviar pedido' }))

    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => url === '/api/cuadernillos/requests' && init?.method === 'POST')).toBe(true))
    const recommendationUrl = fetchMock.mock.calls.map(([url]) => String(url)).find((url) => url.startsWith('/api/cuadernillos/recommendations'))
    expect(recommendationUrl).toContain('cabeceraCueAnexo=180123000')
    const requestCall = fetchMock.mock.calls.find(([url, init]) => url === '/api/cuadernillos/requests' && init?.method === 'POST')
    expect(JSON.parse(requestCall?.[1]?.body as string)).toMatchObject({ cabeceraCueAnexo: '180123000', recipientCueAnexo: '180123457', submit: true })
  })

  it('shows status chips for each request in "Mis pedidos"', async () => {
    const request = (requestId: string, status: string, remaining: unknown[] = []) => ({
      requestId, rootRequestId: requestId, recipientCueAnexo: '180123457', recipientName: 'Escuela Critica',
      cabeceraCueAnexo: '180123456', cabeceraName: 'Escuela Cabecera', status,
      requested: [{ productId: 'product-1', productLabel: 'Cuadernillo A', quantity: 12 }],
      approved: [], remaining, submittedAt: '2026-11-10T12:00:00.000Z', approvedAt: null, approvalIdentity: null,
    })
    const fetchMock = routeFetch({
      '/api/cuadernillos/requests': () => json({ ...emptyRequests, requests: [
        request('r1', 'pending'),
        request('r2', 'approved'),
        request('r3', 'approved', [{ productId: 'product-1', productLabel: 'Cuadernillo A', quantity: 4 }]),
        request('r4', 'rejected'),
      ] }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<CabeceraHome isAdmin={false} readOnly={false} viewAsUserId={null} />)

    expect(await screen.findByText('Pendiente')).toBeInTheDocument()
    expect(screen.getByText('Aprobado')).toBeInTheDocument()
    expect(screen.getByText('Aprobado parcial')).toBeInTheDocument()
    expect(screen.getByText('Rechazado')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pedir remanente' })).toBeInTheDocument()
  })
})
