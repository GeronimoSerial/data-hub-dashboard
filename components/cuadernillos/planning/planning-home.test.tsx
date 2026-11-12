// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { PlanningHome } from './planning-home'

vi.mock('../config/configuracion', () => ({
  Configuracion: () => 'Área de configuración',
}))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const campaign = { id: 'campaign-1', name: 'Distribución 2026', distributionEnabled: true, overassignmentAllowed: false }
const overview = {
  capability: 'planning' as const,
  campaignId: 'campaign-1', campaignOptions: [campaign],
  balances: [{ productId: 'book-a', productLabel: 'Cuadernillo A', globalAvailable: 10, quotaAssigned: null, quotaAvailable: 4, cabeceraCueAnexo: '180000000', cabeceraName: 'Cabecera' }],
  requests: [], eligibility: null, hasMore: false, nextCursor: null,
}

function response(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

function requestRow(requestId: string, status: string, approvedAt: string | null = null) {
  return {
    requestId, rootRequestId: requestId, recipientCueAnexo: '180123457', recipientName: 'Escuela Anexo',
    cabeceraCueAnexo: '180000000', cabeceraName: 'Cabecera', status, requested: [], approved: [], remaining: [],
    submittedAt: null, approvedAt, approvalIdentity: null,
  }
}

// Routes each planning endpoint by URL, so the overview, the requests read and the writes never share one mock sequence.
function routedFetch(overviewBody: unknown, requests: unknown[] = []) {
  return vi.fn().mockImplementation((url: string) => {
    if (url.startsWith('/api/cuadernillos/overview')) return Promise.resolve(response(overviewBody))
    if (url.startsWith('/api/cuadernillos/requests')) {
      return Promise.resolve(response({ campaignId: 'campaign-1', campaignOptions: [campaign], requests, hasMore: false, nextCursor: null }))
    }
    if (url.startsWith('/api/cuadernillos/stock') || url.startsWith('/api/cuadernillos/quotas')) return Promise.resolve(response({ ok: true }))
    return Promise.resolve(response({ error: 'unexpected' }, 500))
  })
}

describe('PlanningHome', () => {
  it('renders current global stock and head-specific remaining quota without inventing original quota', async () => {
    const fetchMock = routedFetch(overview)
    vi.stubGlobal('fetch', fetchMock)

    render(<PlanningHome />)

    expect(await screen.findByRole('row', { name: /Cuadernillo A.*Cabecera.*4/ })).toBeInTheDocument()
    expect(screen.queryByText(/cupo originalmente asignado/i)).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/cuadernillos/overview?capability=planning', expect.anything())
  })

  it('shows summary cards with stock per product and pending and approved counts', async () => {
    const requests = [
      requestRow('r1', 'pending'),
      requestRow('r2', 'approved', new Date().toISOString()),
      requestRow('r3', 'approved', '2020-01-01T00:00:00.000Z'),
    ]
    const fetchMock = routedFetch(overview, requests)
    vi.stubGlobal('fetch', fetchMock)

    render(<PlanningHome />)

    const stock = await screen.findByRole('region', { name: 'Stock global' })
    expect(stock).toHaveTextContent('Cuadernillo A')
    expect(stock).toHaveTextContent('10')
    const counts = screen.getByRole('region', { name: 'Solicitudes' })
    expect(counts).toHaveTextContent(/Pendientes\s*1/)
    expect(counts).toHaveTextContent(/Aprobadas hoy\s*1/)
    expect(fetchMock).toHaveBeenCalledWith('/api/cuadernillos/requests?campaignId=campaign-1&limit=50', expect.anything())
  })

  it('follows request pages so pending counts are not capped at the first page', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.startsWith('/api/cuadernillos/overview')) return Promise.resolve(response(overview))
      if (url.includes('cursor=next-page')) {
        return Promise.resolve(response({ campaignId: 'campaign-1', campaignOptions: [campaign], requests: [requestRow('r2', 'pending')], hasMore: false, nextCursor: null }))
      }
      return Promise.resolve(response({ campaignId: 'campaign-1', campaignOptions: [campaign], requests: [requestRow('r1', 'pending')], hasMore: true, nextCursor: 'next-page' }))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<PlanningHome />)

    expect(await screen.findByRole('region', { name: 'Solicitudes' })).toHaveTextContent(/Pendientes\s*2/)
  })

  it('shows a pending count of zero only when the requests read has no pending rows', async () => {
    vi.stubGlobal('fetch', routedFetch(overview, [requestRow('r1', 'rejected')]))

    render(<PlanningHome />)

    expect(await screen.findByRole('region', { name: 'Solicitudes' })).toHaveTextContent(/Pendientes\s*0/)
  })

  it('keeps the stock and quota forms for planning', async () => {
    vi.stubGlobal('fetch', routedFetch(overview))

    render(<PlanningHome />)

    expect(await screen.findByRole('heading', { name: 'Registrar stock global' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Definir cupo disponible' })).toBeInTheDocument()
  })

  it('posts a stock movement with the prefilled product and the typed quantity', async () => {
    const fetchMock = routedFetch(overview)
    vi.stubGlobal('fetch', fetchMock)

    render(<PlanningHome />)
    fireEvent.change(await screen.findByLabelText('Cantidad de stock'), { target: { value: '25' } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar movimiento' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/cuadernillos/stock', expect.objectContaining({ method: 'POST' })))
    const post = fetchMock.mock.calls.find(([url]) => url === '/api/cuadernillos/stock')!
    const body = JSON.parse(String(post[1].body))
    expect(body).toEqual(expect.objectContaining({ campaignId: 'campaign-1', productId: 'book-a', quantity: 25, movement: 'initial' }))
    expect(typeof body.idempotencyKey).toBe('string')
  })

  it('posts a cabecera quota with the head, product and quantity', async () => {
    const fetchMock = routedFetch(overview)
    vi.stubGlobal('fetch', fetchMock)

    render(<PlanningHome />)
    fireEvent.change(await screen.findByLabelText('Cantidad de cupo disponible'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cupo' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/cuadernillos/quotas', expect.objectContaining({ method: 'POST' })))
    const post = fetchMock.mock.calls.find(([url]) => url === '/api/cuadernillos/quotas')!
    expect(JSON.parse(String(post[1].body))).toEqual({ campaignId: 'campaign-1', cabeceraCueAnexo: '180000000', productId: 'book-a', quantity: 0 })
  })

  it('rejects a stock quantity that is not a positive integer without calling the API', async () => {
    const fetchMock = routedFetch(overview)
    vi.stubGlobal('fetch', fetchMock)

    render(<PlanningHome />)
    fireEvent.change(await screen.findByLabelText('Cantidad de stock'), { target: { value: '0' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Registrar movimiento' }).closest('form')!)

    expect(await screen.findByRole('alert')).toHaveTextContent('Ingresá una cantidad entera mayor que cero.')
    expect(fetchMock).not.toHaveBeenCalledWith('/api/cuadernillos/stock', expect.anything())
  })

})
