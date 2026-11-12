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

describe('PlanningHome', () => {
  it('renders current global stock and head-specific remaining quota without inventing original quota', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(overview))
    vi.stubGlobal('fetch', fetchMock)

    render(<PlanningHome isAdmin={false} readOnly={false} viewAsUserId={null} />)

    expect(await screen.findByRole('row', { name: /Cuadernillo A.*Cabecera.*4/ })).toBeInTheDocument()
    expect(screen.queryByText(/cupo originalmente asignado/i)).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/cuadernillos/overview?capability=planning', expect.anything())
  })

  it('shows summary cards with stock per product and pending and approved counts', async () => {
    const requests = [
      { requestId: 'r1', status: 'pending', approvedAt: null },
      { requestId: 'r2', status: 'approved', approvedAt: new Date().toISOString() },
      { requestId: 'r3', status: 'approved', approvedAt: '2020-01-01T00:00:00.000Z' },
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ ...overview, requests })))

    render(<PlanningHome isAdmin={false} readOnly={false} viewAsUserId={null} />)

    const stock = await screen.findByRole('region', { name: 'Stock global' })
    expect(stock).toHaveTextContent('Cuadernillo A')
    expect(stock).toHaveTextContent('10')
    const counts = screen.getByRole('region', { name: 'Solicitudes' })
    expect(counts).toHaveTextContent(/Pendientes\s*1/)
    expect(counts).toHaveTextContent(/Aprobadas hoy\s*1/)
  })

  it('keeps the stock and quota forms for planning', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(overview)))

    render(<PlanningHome isAdmin={false} readOnly={false} viewAsUserId={null} />)

    expect(await screen.findByRole('heading', { name: 'Registrar stock global' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Definir cupo disponible' })).toBeInTheDocument()
  })

  it('posts a stock movement with the prefilled product and the typed quantity', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(overview))
      .mockResolvedValueOnce(response({ ok: true }))
      .mockResolvedValueOnce(response(overview))
    vi.stubGlobal('fetch', fetchMock)

    render(<PlanningHome isAdmin={false} readOnly={false} viewAsUserId={null} />)
    fireEvent.change(await screen.findByLabelText('Cantidad de stock'), { target: { value: '25' } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar movimiento' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/cuadernillos/stock', expect.objectContaining({ method: 'POST' })))
    const post = fetchMock.mock.calls.find(([url]) => url === '/api/cuadernillos/stock')!
    const body = JSON.parse(String(post[1].body))
    expect(body).toEqual(expect.objectContaining({ campaignId: 'campaign-1', productId: 'book-a', quantity: 25, movement: 'initial' }))
    expect(typeof body.idempotencyKey).toBe('string')
  })

  it('posts a cabecera quota with the head, product and quantity', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(overview))
      .mockResolvedValueOnce(response({ ok: true }))
      .mockResolvedValueOnce(response(overview))
    vi.stubGlobal('fetch', fetchMock)

    render(<PlanningHome isAdmin={false} readOnly={false} viewAsUserId={null} />)
    fireEvent.change(await screen.findByLabelText('Cantidad de cupo disponible'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cupo' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/cuadernillos/quotas', expect.objectContaining({ method: 'POST' })))
    const post = fetchMock.mock.calls.find(([url]) => url === '/api/cuadernillos/quotas')!
    expect(JSON.parse(String(post[1].body))).toEqual({ campaignId: 'campaign-1', cabeceraCueAnexo: '180000000', productId: 'book-a', quantity: 0 })
  })

  it('rejects a stock quantity that is not a positive integer without calling the API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(overview))
    vi.stubGlobal('fetch', fetchMock)

    render(<PlanningHome isAdmin={false} readOnly={false} viewAsUserId={null} />)
    fireEvent.change(await screen.findByLabelText('Cantidad de stock'), { target: { value: '0' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Registrar movimiento' }).closest('form')!)

    expect(await screen.findByRole('alert')).toHaveTextContent('Ingresá una cantidad entera mayor que cero.')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('disables write controls in read-only mode and sends viewAs with the read', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(overview))
    vi.stubGlobal('fetch', fetchMock)

    render(<PlanningHome isAdmin={false} readOnly viewAsUserId="supervisor-1" />)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Registrar movimiento' })).toBeDisabled())
    expect(screen.getByRole('button', { name: 'Guardar cupo' })).toBeDisabled()
    expect(fetchMock).toHaveBeenCalledWith('/api/cuadernillos/overview?capability=planning&viewAs=supervisor-1', expect.anything())
  })

  it('shows the configuration area only to admins outside read-only mode', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(overview)))

    const { rerender } = render(<PlanningHome isAdmin={false} readOnly={false} viewAsUserId={null} />)
    await screen.findByRole('heading', { name: 'Registrar stock global' })
    expect(screen.queryByRole('button', { name: 'Configuración' })).not.toBeInTheDocument()

    rerender(<PlanningHome isAdmin readOnly={false} viewAsUserId={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Configuración' }))
    expect(screen.getByText('Área de configuración')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Registrar stock global' })).not.toBeInTheDocument()
  })
})
