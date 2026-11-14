// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { PlanningHome } from './planning-home'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const campaign = { id: 'campaign-1', name: 'Distribución 2026', distributionEnabled: true, overassignmentAllowed: false }
const overview = {
  capability: 'planning' as const,
  campaignId: 'campaign-1', campaignOptions: [campaign],
  balances: [
    { productId: 'book-a', productLabel: 'Cuadernillo A', globalAvailable: 10 },
    { productId: 'book-b', productLabel: 'Cuadernillo B', globalAvailable: null },
  ],
}

function response(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

const remito = {
  remitoId: 'remito-1', campaignId: 'campaign-1', cabeceraCueAnexo: '180000000', status: 'dispatched',
  dispatchedAt: '2026-11-10T12:00:00.000Z', cabeceraReceivedAt: '2026-11-11T12:00:00.000Z',
  lines: [
    { recipientCueAnexo: '180123457', recipientName: 'Escuela A', status: 'at_cabecera', items: [
      { productId: 'book-a', dispatchedQuantity: 30, cabeceraReceivedQuantity: 25, schoolReceivedQuantity: null },
    ] },
    { recipientCueAnexo: '180123458', recipientName: 'Escuela B', status: 'received', items: [
      { productId: 'book-a', dispatchedQuantity: 18, cabeceraReceivedQuantity: 18, schoolReceivedQuantity: 18 },
    ] },
  ],
}

function routedFetch(overviewBody: unknown = overview, remitos: unknown[] = []) {
  return vi.fn().mockImplementation((url: string) => {
    if (url.startsWith('/api/cuadernillos/overview')) return Promise.resolve(response(overviewBody))
    if (url.startsWith('/api/cuadernillos/remitos')) return Promise.resolve(response({ remitos, hasMore: false, nextCursor: null }))
    if (url.startsWith('/api/cuadernillos/cabeceras')) return Promise.resolve(response({ cabeceras: [{ cue: '180000000', nombre: 'Cabecera Norte', departamento: 'Capital', status: 'confirmada' }] }))
    if (url.startsWith('/api/cuadernillos/stock')) return Promise.resolve(response({ ok: true }))
    return Promise.resolve(response({ error: 'unexpected' }, 500))
  })
}

describe('PlanningHome', () => {
  it('shows stock per grade and no quota or request UI', async () => {
    const fetchMock = routedFetch()
    vi.stubGlobal('fetch', fetchMock)

    render(<PlanningHome />)

    expect(await screen.findByRole('button', { name: 'Cuadernillo A: stock 10' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cuadernillo B: sin stock' })).toBeInTheDocument()
    expect(screen.queryByText(/cupo/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/pedidos? pendientes?/i)).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/cuadernillos/overview?capability=planning', expect.anything())
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith('/api/cuadernillos/requests'))).toBe(false)
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith('/api/cuadernillos/quotas'))).toBe(false)
  })

  it('says so when there is no active campaign', async () => {
    vi.stubGlobal('fetch', routedFetch({ ...overview, campaignId: null, campaignOptions: [], balances: [] }))

    render(<PlanningHome />)

    expect(await screen.findByText('No hay campañas activas para consultar.')).toBeInTheDocument()
  })

  it('registers a replenishment when the grade already has stock', async () => {
    const fetchMock = routedFetch()
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
    const fetchMock = routedFetch()
    vi.stubGlobal('fetch', fetchMock)

    render(<PlanningHome />)
    fireEvent.click(await screen.findByRole('button', { name: 'Cuadernillo B: sin stock' }))
    fireEvent.change(await screen.findByLabelText('Cantidad de stock'), { target: { value: '40' } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar movimiento' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/cuadernillos/stock', expect.objectContaining({ method: 'POST' })))
    const post = fetchMock.mock.calls.find(([url]) => url === '/api/cuadernillos/stock')!
    expect(JSON.parse(String(post[1].body))).toEqual(expect.objectContaining({ productId: 'book-b', quantity: 40, movement: 'initial' }))
  })

  it('does not allow registering a stock movement of zero', async () => {
    const fetchMock = routedFetch()
    vi.stubGlobal('fetch', fetchMock)

    render(<PlanningHome />)
    fireEvent.click(await screen.findByRole('button', { name: 'Cuadernillo A: stock 10' }))

    expect(await screen.findByRole('button', { name: 'Registrar movimiento' })).toBeDisabled()
    expect(fetchMock).not.toHaveBeenCalledWith('/api/cuadernillos/stock', expect.anything())
  })

  it('lists remitos with a status per leg and dispatched vs received quantities with shortfall', async () => {
    const fetchMock = routedFetch(overview, [remito])
    vi.stubGlobal('fetch', fetchMock)

    render(<PlanningHome />)
    const row = await screen.findByRole('button', { name: /Remito a Cabecera Norte/ })
    expect(row).toHaveTextContent('Despachado')
    expect(row).toHaveTextContent('Recibido por cabecera')
    expect(row).toHaveTextContent('Recibido por escuela 1/2')
    expect(fetchMock).toHaveBeenCalledWith('/api/cuadernillos/remitos?campaignId=campaign-1&limit=20', expect.anything())

    fireEvent.click(row)
    const lineA = await screen.findByRole('region', { name: 'Escuela A' })
    expect(lineA).toHaveTextContent('Despachado 30 · Cabecera 25 · Escuela pendiente')
    expect(lineA).toHaveTextContent('Planeamiento → Cabecera: faltan 5')
    expect(within(screen.getByRole('region', { name: 'Escuela B' })).queryByText(/faltan/)).not.toBeInTheDocument()
  })

  it('shows shortfall reasons, signers and the product name fallback for each leg', async () => {
    const detailed = {
      ...remito,
      cabeceraReceivedBy: { userId: 'u-cab', name: 'Cabecera Norte' },
      lines: [{
        recipientCueAnexo: '180123457', recipientName: 'Escuela A', status: 'received',
        cabeceraShortfallReason: 'Cajas dañadas en el traslado', schoolShortfallReason: 'Faltaron dos cajas',
        schoolReceivedBy: { userId: 'u-school', name: 'Directora A' }, schoolReceivedAt: '2026-11-12T12:00:00.000Z',
        items: [{ productId: 'unknown-book', productName: 'Matemática 2°', dispatchedQuantity: 30, cabeceraReceivedQuantity: 25, schoolReceivedQuantity: 20 }],
      }],
    }
    vi.stubGlobal('fetch', routedFetch(overview, [detailed]))

    render(<PlanningHome />)
    fireEvent.click(await screen.findByRole('button', { name: /Remito a Cabecera Norte/ }))

    const line = await screen.findByRole('region', { name: 'Escuela A' })
    expect(line).toHaveTextContent('Matemática 2°')
    expect(line).toHaveTextContent('Planeamiento → Cabecera: faltan 5')
    expect(line).toHaveTextContent('Cabecera → Escuela: faltan 5')
    expect(line).toHaveTextContent('Motivo de la diferencia (Planeamiento → Cabecera): Cajas dañadas en el traslado')
    expect(line).toHaveTextContent('Motivo de la diferencia (Cabecera → Escuela): Faltaron dos cajas')
    expect(line).toHaveTextContent('Recibido por la escuela: Directora A')
    expect(screen.getByText(/Recibido por la cabecera: Cabecera Norte/)).toBeInTheDocument()
  })

  it('flags a remito the cabecera has not received yet', async () => {
    vi.stubGlobal('fetch', routedFetch(overview, [{ ...remito, cabeceraReceivedAt: null, lines: [] }]))

    render(<PlanningHome />)

    expect(await screen.findByRole('button', { name: /Remito a Cabecera Norte/ })).toHaveTextContent('Pendiente en cabecera')
  })
})
