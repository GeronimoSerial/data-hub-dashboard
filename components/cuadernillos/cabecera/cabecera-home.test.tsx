// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CabeceraHome } from './cabecera-home'
import { LOAD_TIMEOUT_MS } from './cabecera-api'

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

/** Opens the "Nuevo pedido" drawer once the cabecera and the campaign have loaded. */
async function openNewRequest() {
  const button = await screen.findByRole('button', { name: 'Nuevo pedido' })
  await waitFor(() => expect(button).toBeEnabled())
  fireEvent.click(button)
  return screen.findByLabelText('CUE de la escuela')
}

describe('CabeceraHome request flow', () => {
  it('searches critical schools by CUE and only offers the ones the endpoint returns', async () => {
    const fetchMock = routeFetch()
    vi.stubGlobal('fetch', fetchMock)

    render(<CabeceraHome />)

    fireEvent.change(await openNewRequest(), { target: { value: '180123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar escuela' }))

    expect(await screen.findByText('Escuela Critica')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem').filter((item) => item.textContent?.includes('Escuela Critica'))).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/cuadernillos/schools?cue=180123', expect.anything())
  })

  it('asks the server for recommendations scoped to the requesting cabecera cue', async () => {
    const fetchMock = routeFetch()
    vi.stubGlobal('fetch', fetchMock)

    render(<CabeceraHome />)
    fireEvent.change(await openNewRequest(), { target: { value: '180123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar escuela' }))
    fireEvent.click(await screen.findByRole('button', { name: /Elegir Escuela Critica/ }))

    await waitFor(() => expect(screen.getByLabelText('Cantidad · Cuadernillo A')).toHaveValue(12))
    const recommendationUrl = fetchMock.mock.calls.map(([url]) => String(url)).find((url) => url.startsWith('/api/cuadernillos/recommendations'))
    expect(recommendationUrl).toContain('cueAnexo=180123457')
    expect(recommendationUrl).toContain('cabeceraCueAnexo=180123456')
  })

  it('submits the same body the cabecera request form posted, with a retry key', async () => {
    const fetchMock = routeFetch()
    vi.stubGlobal('fetch', fetchMock)

    render(<CabeceraHome />)
    fireEvent.change(await openNewRequest(), { target: { value: '180123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar escuela' }))
    fireEvent.click(await screen.findByRole('button', { name: /Elegir Escuela Critica/ }))
    await waitFor(() => expect(screen.getByLabelText('Cantidad · Cuadernillo A')).toHaveValue(12))
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

    render(<CabeceraHome />)

    expect(await screen.findByText('Pendiente')).toBeInTheDocument()
    expect(screen.getByText('Aprobado')).toBeInTheDocument()
    expect(screen.getByText('Aprobado parcial')).toBeInTheDocument()
    expect(screen.getByText('Rechazado')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pedir remanente' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('Aprobado parcial'))
    expect(await screen.findByRole('button', { name: 'Pedir remanente' })).toBeInTheDocument()
  })

  it('shows the selected school only, and "Cambiar escuela" clears the selection', async () => {
    const schools = { schools: [
      { cueAnexo: '180123457', nombre: 'Escuela Critica', departamento: 'CAPITAL', severity: 'Crítica' },
      { cueAnexo: '180123458', nombre: 'Escuela Otra', departamento: 'CAPITAL', severity: 'Crítica' },
    ] }
    vi.stubGlobal('fetch', routeFetch({ '/api/cuadernillos/schools': () => json(schools) }))

    render(<CabeceraHome />)
    fireEvent.change(await openNewRequest(), { target: { value: '180123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar escuela' }))
    fireEvent.click(await screen.findByRole('button', { name: /Elegir Escuela Critica/ }))

    expect(screen.getByText('Seleccionada')).toBeInTheDocument()
    expect(screen.queryByText('Escuela Otra')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Elegir Escuela Critica/ })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cambiar escuela' }))
    expect(screen.queryByText('Seleccionada')).not.toBeInTheDocument()
    expect(await screen.findByText('Escuela Otra')).toBeInTheDocument()
  })

  it('opens the per-product detail of a request in a drawer', async () => {
    const request = {
      requestId: 'r2', rootRequestId: 'r2', recipientCueAnexo: '180123457', recipientName: 'Escuela Critica',
      cabeceraCueAnexo: '180123456', cabeceraName: 'Escuela Cabecera', status: 'approved',
      requested: [{ productId: 'product-1', productLabel: 'Cuadernillo A', quantity: 12 }],
      approved: [{ productId: 'product-1', productLabel: 'Cuadernillo A', quantity: 10 }], remaining: [],
      submittedAt: '2026-11-10T12:00:00.000Z', approvedAt: null, approvalIdentity: null,
    }
    vi.stubGlobal('fetch', routeFetch({ '/api/cuadernillos/requests': () => json({ ...emptyRequests, requests: [request] }) }))

    render(<CabeceraHome />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: /Escuela Critica/ }))

    const drawer = await screen.findByRole('dialog')
    expect(drawer).toHaveTextContent('Detalle del pedido')
    expect(drawer).toHaveTextContent('Cuadernillo A')
    expect(drawer).toHaveTextContent('10 de 12')
  })

  it('shows the quota per grade assigned by planning', async () => {
    vi.stubGlobal('fetch', routeFetch({
      '/api/cuadernillos/overview': () => json({ campaignId: 'campaign-1', campaignOptions: [], balances: [
        { productId: 'p1', productLabel: 'Cuadernillo para estudiantes de 1.er grado', globalAvailable: null, quotaAssigned: null, quotaAvailable: 100, cabeceraCueAnexo: '180123456', cabeceraName: 'Escuela Cabecera' },
        { productId: 'p2', productLabel: 'Cuadernillo para estudiantes de 2.º grado', globalAvailable: null, quotaAssigned: null, quotaAvailable: 0, cabeceraCueAnexo: '180123456', cabeceraName: 'Escuela Cabecera' },
      ] }),
    }))

    render(<CabeceraHome />)

    const tiles = await screen.findByLabelText('Cupo por grado')
    expect(tiles).toHaveTextContent('1.er grado')
    expect(tiles).toHaveTextContent('100')
    expect(tiles).toHaveTextContent('2.º grado')
    expect(screen.getByText('100 en total')).toBeInTheDocument()
  })

  it('explains that planning has not assigned quota yet', async () => {
    vi.stubGlobal('fetch', routeFetch({
      '/api/cuadernillos/overview': () => json({ campaignId: 'campaign-1', campaignOptions: [], balances: [
        { productId: 'p1', productLabel: 'Cuadernillo A', globalAvailable: null, quotaAssigned: null, quotaAvailable: 0, cabeceraCueAnexo: '180123456', cabeceraName: 'Escuela Cabecera' },
      ] }),
    }))

    render(<CabeceraHome />)

    expect(await screen.findByText('Todavía no tenés cupo asignado')).toBeInTheDocument()
  })

  it('shows a dash instead of "sin dato" when the recommendation or quota is missing', async () => {
    vi.stubGlobal('fetch', routeFetch({
      '/api/cuadernillos/overview': () => json({ campaignId: 'campaign-1', campaignOptions: [], balances: [
        { productId: 'product-1', productLabel: 'Cuadernillo A', globalAvailable: 100, quotaAssigned: 0, quotaAvailable: null, cabeceraCueAnexo: '180123456', cabeceraName: 'Escuela Cabecera' },
      ] }),
      '/api/cuadernillos/recommendations': () => json({ recommendations: [{ productId: 'product-1', students: null, suggested: null, sourceCutId: null }] }),
    }))

    render(<CabeceraHome />)
    fireEvent.change(await openNewRequest(), { target: { value: '180123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar escuela' }))
    fireEvent.click(await screen.findByRole('button', { name: /Elegir Escuela Critica/ }))

    expect(await screen.findByText('Disponible —')).toBeInTheDocument()
    expect(screen.queryByText(/Recomendado/)).not.toBeInTheDocument()
    expect(screen.queryByText(/sin dato/)).not.toBeInTheDocument()
  })
})

/** Row exactly as listCabeceras returns it (lib/cuadernillos/cabeceras.ts), including the account objects. */

describe('CabeceraHome loading', () => {
  it('offers Reintentar after a failed cabeceras load and recovers on retry', async () => {
    let calls = 0
    vi.stubGlobal('fetch', routeFetch({
      '/api/cuadernillos/assignments': () => {
        calls += 1
        return calls === 1 ? json({ error: 'assignments_failed' }, false) : json(assignments)
      },
    }))

    render(<CabeceraHome />)

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron cargar las cabeceras de esta cuenta.')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Nuevo pedido' })).toBeEnabled())
    expect(calls).toBe(2)
  })

  it('ends a request that never answers in a visible error instead of loading forever', async () => {
    vi.useFakeTimers()
    try {
      vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
        if (url.startsWith('/api/cuadernillos/assignments')) {
          return new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
          })
        }
        return Promise.resolve(json({}))
      }))

      render(<CabeceraHome />)
      expect(screen.getByText('Cargando cabeceras…')).toBeInTheDocument()

      await act(async () => { vi.advanceTimersByTime(LOAD_TIMEOUT_MS) })

      expect(screen.getByText('No se pudieron cargar las cabeceras de esta cuenta.')).toBeInTheDocument()
      expect(screen.queryByText('Cargando cabeceras…')).not.toBeInTheDocument()
      expect(screen.getAllByRole('button', { name: 'Reintentar' }).length).toBeGreaterThan(0)
    } finally {
      vi.useRealTimers()
    }
  })
})
