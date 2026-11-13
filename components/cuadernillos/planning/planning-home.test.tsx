// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { PlanningHome } from './planning-home'

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

const noStock = { ...overview, balances: [{ ...overview.balances[0], globalAvailable: null, quotaAvailable: 0 }] }

describe('PlanningHome', () => {
  it('shows stock per grade and quota per cabecera as rows without inventing original quota', async () => {
    const fetchMock = routedFetch(overview)
    vi.stubGlobal('fetch', fetchMock)

    render(<PlanningHome />)

    expect(await screen.findByRole('button', { name: 'Cuadernillo A: stock 10' })).toHaveTextContent(/Asignado 4 · Sin asignar 6/)
    const head = screen.getByRole('button', { name: /Cabecera/ })
    expect(head).toHaveTextContent('CUE 180000000')
    expect(head).toHaveTextContent('4')
    expect(screen.queryByText(/cupo originalmente asignado/i)).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/cuadernillos/overview?capability=planning', expect.anything())
  })

  it('summarizes stock, assigned and unassigned units with the pending and approved counts', async () => {
    const requests = [
      requestRow('r1', 'pending'),
      requestRow('r2', 'approved', new Date().toISOString()),
      requestRow('r3', 'approved', '2020-01-01T00:00:00.000Z'),
    ]
    const fetchMock = routedFetch(overview, requests)
    vi.stubGlobal('fetch', fetchMock)

    render(<PlanningHome />)

    const summary = await screen.findByLabelText('Resumen de la campaña')
    expect(summary).toHaveTextContent(/Stock total\s*10/)
    expect(summary).toHaveTextContent(/Asignado a cabeceras\s*4/)
    expect(summary).toHaveTextContent(/Sin asignar\s*6/)
    expect(summary).toHaveTextContent(/Pedidos pendientes\s*1/)
    expect(summary).toHaveTextContent(/Aprobados hoy\s*1/)
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

    expect(await screen.findByLabelText('Resumen de la campaña')).toHaveTextContent(/Pedidos pendientes\s*2/)
  })

  it('shows a pending count of zero only when the requests read has no pending rows', async () => {
    vi.stubGlobal('fetch', routedFetch(overview, [requestRow('r1', 'rejected')]))

    render(<PlanningHome />)

    expect(await screen.findByLabelText('Resumen de la campaña')).toHaveTextContent(/Pedidos pendientes\s*0/)
  })

  it('says so when there is no active campaign', async () => {
    vi.stubGlobal('fetch', routedFetch({ ...overview, campaignId: null, campaignOptions: [], balances: [] }))

    render(<PlanningHome />)

    expect(await screen.findByText('No hay campañas activas para consultar.')).toBeInTheDocument()
  })

  it('registers a replenishment when the grade already has stock', async () => {
    const fetchMock = routedFetch(overview)
    vi.stubGlobal('fetch', fetchMock)

    render(<PlanningHome />)
    fireEvent.click(await screen.findByRole('button', { name: 'Cuadernillo A: stock 10' }))
    expect(await screen.findByRole('dialog')).toHaveTextContent('Stock actual: 10')
    fireEvent.change(screen.getByLabelText('Cantidad de stock'), { target: { value: '25' } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar movimiento' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/cuadernillos/stock', expect.objectContaining({ method: 'POST' })))
    const post = fetchMock.mock.calls.find(([url]) => url === '/api/cuadernillos/stock')!
    const body = JSON.parse(String(post[1].body))
    expect(body).toEqual(expect.objectContaining({ campaignId: 'campaign-1', productId: 'book-a', quantity: 25, movement: 'replenishment' }))
    expect(typeof body.idempotencyKey).toBe('string')
    expect(await screen.findByText('Movimiento de stock registrado.')).toBeInTheDocument()
  })

  it('registers the initial stock when the grade has none yet', async () => {
    const fetchMock = routedFetch(noStock)
    vi.stubGlobal('fetch', fetchMock)

    render(<PlanningHome />)
    fireEvent.click(await screen.findByRole('button', { name: 'Cuadernillo A: sin stock' }))
    fireEvent.change(await screen.findByLabelText('Cantidad de stock'), { target: { value: '40' } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar movimiento' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/cuadernillos/stock', expect.objectContaining({ method: 'POST' })))
    const post = fetchMock.mock.calls.find(([url]) => url === '/api/cuadernillos/stock')!
    expect(JSON.parse(String(post[1].body))).toEqual(expect.objectContaining({ productId: 'book-a', quantity: 40, movement: 'initial' }))
  })

  it('does not allow registering a stock movement of zero', async () => {
    const fetchMock = routedFetch(overview)
    vi.stubGlobal('fetch', fetchMock)

    render(<PlanningHome />)
    fireEvent.click(await screen.findByRole('button', { name: 'Cuadernillo A: stock 10' }))

    expect(await screen.findByRole('button', { name: 'Registrar movimiento' })).toBeDisabled()
    expect(fetchMock).not.toHaveBeenCalledWith('/api/cuadernillos/stock', expect.anything())
  })

  it('saves only the changed quotas of a cabecera, one per grade', async () => {
    const fetchMock = routedFetch(overview)
    vi.stubGlobal('fetch', fetchMock)

    render(<PlanningHome />)
    fireEvent.click(await screen.findByRole('button', { name: /Cabecera/ }))
    expect(await screen.findByRole('dialog')).toHaveTextContent('Podés asignar hasta 10')
    expect(screen.getByRole('button', { name: 'Guardar cupo' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Cupo · Cuadernillo A'), { target: { value: '7' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cupo' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/cuadernillos/quotas', expect.objectContaining({ method: 'POST' })))
    const posts = fetchMock.mock.calls.filter(([url]) => url === '/api/cuadernillos/quotas')
    expect(posts).toHaveLength(1)
    expect(JSON.parse(String(posts[0][1].body))).toEqual({ campaignId: 'campaign-1', cabeceraCueAnexo: '180000000', productId: 'book-a', quantity: 7 })
    expect(await screen.findByText('Cupos actualizados.')).toBeInTheDocument()
  })

  it('never lets a quota go above the stock that is left unassigned', async () => {
    vi.stubGlobal('fetch', routedFetch(overview))

    render(<PlanningHome />)
    fireEvent.click(await screen.findByRole('button', { name: /Cabecera/ }))
    const input = await screen.findByLabelText('Cupo · Cuadernillo A')
    fireEvent.change(input, { target: { value: '50' } })

    expect(input).toHaveValue(10)
  })

  it('shows the server reason when a quota is refused', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.startsWith('/api/cuadernillos/overview')) return Promise.resolve(response(overview))
      if (url.startsWith('/api/cuadernillos/requests')) return Promise.resolve(response({ campaignId: 'campaign-1', campaignOptions: [campaign], requests: [], hasMore: false, nextCursor: null }))
      return Promise.resolve(response({ error: 'quota_exceeds_stock' }, 409))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<PlanningHome />)
    fireEvent.click(await screen.findByRole('button', { name: /Cabecera/ }))
    fireEvent.change(await screen.findByLabelText('Cupo · Cuadernillo A'), { target: { value: '9' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cupo' }))

    expect(await screen.findByText('El cupo supera el stock que queda sin asignar.')).toBeInTheDocument()
  })
})
