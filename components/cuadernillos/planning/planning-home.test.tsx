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
    expect(screen.getByRole('dialog')).toHaveTextContent('Va a quedar en35')
    fireEvent.click(screen.getByRole('button', { name: 'Guardar stock' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/cuadernillos/stock', expect.objectContaining({ method: 'POST' })))
    const post = fetchMock.mock.calls.find(([url]) => url === '/api/cuadernillos/stock')!
    const body = JSON.parse(String(post[1].body))
    expect(body).toEqual(expect.objectContaining({ campaignId: 'campaign-1', productId: 'book-a', quantity: 25, movement: 'replenishment' }))
    expect(typeof body.idempotencyKey).toBe('string')
    expect(await screen.findByText('Stock guardado.')).toBeInTheDocument()
  })

  it('registers the initial stock when the grade has none yet', async () => {
    const fetchMock = routedFetch()
    vi.stubGlobal('fetch', fetchMock)

    render(<PlanningHome />)
    fireEvent.click(await screen.findByRole('button', { name: 'Cuadernillo B: sin stock' }))
    fireEvent.change(await screen.findByLabelText('Cantidad de stock'), { target: { value: '40' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar stock' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/cuadernillos/stock', expect.objectContaining({ method: 'POST' })))
    const post = fetchMock.mock.calls.find(([url]) => url === '/api/cuadernillos/stock')!
    expect(JSON.parse(String(post[1].body))).toEqual(expect.objectContaining({ productId: 'book-b', quantity: 40, movement: 'initial' }))
  })

  it('does not allow registering a stock movement of zero', async () => {
    const fetchMock = routedFetch()
    vi.stubGlobal('fetch', fetchMock)

    render(<PlanningHome />)
    fireEvent.click(await screen.findByRole('button', { name: 'Cuadernillo A: stock 10' }))

    expect(await screen.findByRole('button', { name: 'Guardar stock' })).toBeDisabled()
    expect(fetchMock).not.toHaveBeenCalledWith('/api/cuadernillos/stock', expect.anything())
  })

  it('opens with a task card whose main action starts a new envío', async () => {
    vi.stubGlobal('fetch', routedFetch())

    render(<PlanningHome />)

    const card = await screen.findByRole('region', { name: 'Lo que tenés que hacer' })
    expect(card).toHaveTextContent('Todavía no enviaste cuadernillos en esta campaña.')
    fireEvent.click(within(card).getByRole('button', { name: 'Enviar cuadernillos' }))
    expect(await screen.findByRole('dialog')).toHaveTextContent('Enviar cuadernillos')
    expect(screen.queryByText(/remito/i)).not.toBeInTheDocument()
  })

  it('counts the envíos still waiting for the cabecera in plain words', async () => {
    vi.stubGlobal('fetch', routedFetch(overview, [{ ...remito, cabeceraReceivedAt: null, lines: [] }]))

    render(<PlanningHome />)

    expect(await screen.findByRole('region', { name: 'Lo que tenés que hacer' })).toHaveTextContent('1 envío todavía no fue confirmado por la cabecera.')
  })

  it('hides the campaign selector when there is only one campaign', async () => {
    vi.stubGlobal('fetch', routedFetch())

    render(<PlanningHome />)
    await screen.findByRole('button', { name: 'Cuadernillo A: stock 10' })

    expect(screen.queryByRole('group', { name: 'Campaña' })).not.toBeInTheDocument()
  })

  it('shows the campaign selector when there are several campaigns', async () => {
    const other = { ...campaign, id: 'campaign-2', name: 'Distribución 2027' }
    vi.stubGlobal('fetch', routedFetch({ ...overview, campaignOptions: [campaign, other] }))

    render(<PlanningHome />)

    expect(await screen.findByRole('group', { name: 'Campaña' })).toBeInTheDocument()
  })

  it('selects the only campaign by itself when the overview comes without one', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.startsWith('/api/cuadernillos/overview')) {
        const withCampaign = url.includes('campaignId=campaign-1')
        return Promise.resolve(response(withCampaign ? overview : { ...overview, campaignId: null, balances: [] }))
      }
      if (url.startsWith('/api/cuadernillos/remitos')) return Promise.resolve(response({ remitos: [], hasMore: false, nextCursor: null }))
      return Promise.resolve(response({ cabeceras: [] }))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<PlanningHome />)

    expect(await screen.findByRole('button', { name: 'Cuadernillo A: stock 10' })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/cuadernillos/overview?capability=planning&campaignId=campaign-1', expect.anything())
    expect(screen.queryByRole('group', { name: 'Campaña' })).not.toBeInTheDocument()
  })

  it('shows the circuit guide on the empty envíos list', async () => {
    vi.stubGlobal('fetch', routedFetch())

    render(<PlanningHome />)

    expect(await screen.findByText('Todavía no enviaste cuadernillos')).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Cómo funciona' })).toBeInTheDocument()
  })

  it('lists envíos with a journey and the sent vs received quantities with the shortfall', async () => {
    const fetchMock = routedFetch(overview, [remito])
    vi.stubGlobal('fetch', fetchMock)

    render(<PlanningHome />)
    const row = await screen.findByRole('button', { name: /Envío a Cabecera Norte/ })
    expect(row).toHaveTextContent('2 escuelas')
    expect(row).toHaveTextContent('48 cuadernillos')
    expect(row).toHaveTextContent('En reparto')
    expect(row).toHaveTextContent('1 de 2 escuelas ya recibió · llegaron 5 de menos')
    expect(screen.queryByText('Pendiente en cabecera')).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/cuadernillos/remitos?campaignId=campaign-1&limit=20', expect.anything())
    const summary = screen.getByLabelText('Resumen de la campaña')
    expect(summary).toHaveTextContent('Enviados48En 1 envío')
    expect(summary).toHaveTextContent('Recibidos por las escuelas181 de 2 escuelas ya confirmaron')
    expect(summary).toHaveTextContent('Llegaron de menos5En 1 envío')

    fireEvent.click(row)
    const journey = screen.getByRole('list', { name: 'Recorrido del envío a Cabecera Norte' })
    const steps = within(journey).getAllByRole('listitem')
    expect(steps.map((step) => step.getAttribute('data-state'))).toEqual(['done', 'short', 'current'])
    expect(steps[0]).toHaveTextContent('Enviado')
    expect(steps[1]).toHaveTextContent('Llegó a la cabecera')
    expect(steps[1]).toHaveTextContent('llegó de menos')
    expect(steps[2]).toHaveTextContent('Llegó a la escuela')
    expect(steps[2]).toHaveTextContent('1 de 2 escuelas')
    const lineA = await screen.findByRole('region', { name: 'Escuela A' })
    const cells = within(lineA).getAllByRole('cell').map((cell) => cell.textContent)
    expect(cells).toEqual(['30', '255 de menos', 'Pendiente'])
    expect(within(lineA).getAllByRole('columnheader').map((header) => header.textContent)).toEqual(['Grado', 'Enviado', 'Cabecera', 'Escuela'])
    expect(within(screen.getByRole('region', { name: 'Escuela B' })).queryByText(/de menos/)).not.toBeInTheDocument()
  })

  it('marks every journey step done once all the schools confirmed', async () => {
    const complete = {
      ...remito,
      lines: remito.lines.map((line) => ({
        ...line, status: 'received', items: line.items.map((item) => ({ ...item, cabeceraReceivedQuantity: item.dispatchedQuantity, schoolReceivedQuantity: item.dispatchedQuantity })),
      })),
    }
    vi.stubGlobal('fetch', routedFetch(overview, [complete]))

    render(<PlanningHome />)
    fireEvent.click(await screen.findByRole('button', { name: /Envío a Cabecera Norte/ }))

    const journey = await screen.findByRole('list', { name: 'Recorrido del envío a Cabecera Norte' })
    expect(within(journey).getAllByRole('listitem').map((step) => step.getAttribute('data-state'))).toEqual(['done', 'done', 'done'])
  })

  it('marks the school step short when everything arrived but with less', async () => {
    const lessAtSchool = {
      ...remito,
      lines: [{ ...remito.lines[1], items: [{ productId: 'book-a', dispatchedQuantity: 18, cabeceraReceivedQuantity: 18, schoolReceivedQuantity: 15 }] }],
    }
    vi.stubGlobal('fetch', routedFetch(overview, [lessAtSchool]))

    render(<PlanningHome />)
    fireEvent.click(await screen.findByRole('button', { name: /Envío a Cabecera Norte/ }))

    const journey = await screen.findByRole('list', { name: 'Recorrido del envío a Cabecera Norte' })
    expect(within(journey).getAllByRole('listitem').map((step) => step.getAttribute('data-state'))).toEqual(['done', 'done', 'short'])
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
    fireEvent.click(await screen.findByRole('button', { name: /Envío a Cabecera Norte/ }))

    const line = await screen.findByRole('region', { name: 'Escuela A' })
    expect(line).toHaveTextContent('Matemática 2°')
    expect(within(line).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['30', '255 de menos', '205 de menos'])
    expect(line).toHaveTextContent('Por qué llegó de menos a la cabecera: Cajas dañadas en el traslado')
    expect(line).toHaveTextContent('Por qué llegó de menos a la escuela: Faltaron dos cajas')
    expect(line).toHaveTextContent('Confirmó la escuela: Directora A')
    expect(within(screen.getByRole('list', { name: 'Recorrido del envío a Cabecera Norte' })).getAllByRole('listitem')[1]).toHaveTextContent('Cabecera Norte ·')
  })

  it('flags an envío the cabecera has not confirmed yet', async () => {
    vi.stubGlobal('fetch', routedFetch(overview, [{ ...remito, cabeceraReceivedAt: null, lines: [] }]))

    render(<PlanningHome />)
    fireEvent.click(await screen.findByRole('button', { name: /Envío a Cabecera Norte/ }))

    const journey = await screen.findByRole('list', { name: 'Recorrido del envío a Cabecera Norte' })
    const steps = within(journey).getAllByRole('listitem')
    expect(steps.map((step) => step.getAttribute('data-state'))).toEqual(['done', 'current', 'pending'])
    expect(steps[1]).toHaveTextContent('Todavía no')
  })

  it('names a directo envío and keeps it out of the envíos waiting for a cabecera', async () => {
    const direct = {
      remitoId: 'remito-direct', campaignId: 'campaign-1', modo: 'directo', cabeceraCueAnexo: null, status: 'dispatched',
      dispatchedAt: '2026-11-10T12:00:00.000Z', cabeceraReceivedAt: null,
      lines: [{ recipientCueAnexo: '180123457', recipientName: 'Escuela A', status: 'in_transit', items: [
        { productId: 'book-a', dispatchedQuantity: 5, cabeceraReceivedQuantity: null, schoolReceivedQuantity: null },
      ] }],
    }
    vi.stubGlobal('fetch', routedFetch(overview, [direct]))

    render(<PlanningHome />)

    expect(await screen.findByRole('button', { name: /Envío a Envío directo/ })).toHaveTextContent('En camino a escuelas')
    expect(screen.getByRole('region', { name: 'Lo que tenés que hacer' })).toHaveTextContent('Ningún envío está esperando a la cabecera.')
  })
})
