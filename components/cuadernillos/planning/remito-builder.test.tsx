// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { RemitoBuilder } from './remito-builder'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const products = [
  { productId: 'book-1', productLabel: 'Cuadernillo 1.er grado', available: 100 },
  { productId: 'book-2', productLabel: 'Cuadernillo 2.º grado', available: 30 },
]
const school = { cueAnexo: '180123457', nombre: 'Escuela A', departamento: 'Capital', severity: 'Crítica' }

function response(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

function mockFetch(post: () => unknown) {
  return vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    if (url.startsWith('/api/cuadernillos/cabeceras')) {
      return Promise.resolve(response({ cabeceras: [
        { cue: '180000000', nombre: 'Cabecera Norte', departamento: 'Capital', status: 'confirmada' },
        { cue: '180000001', nombre: 'Cabecera Sin Cuenta', departamento: 'Capital', status: 'pendiente' },
      ] }))
    }
    if (url.startsWith('/api/cuadernillos/schools')) return Promise.resolve(response({ schools: [school] }))
    if (url.startsWith('/api/cuadernillos/recommendations')) {
      return Promise.resolve(response({ recommendations: [
        { productId: 'book-1', students: 30, suggested: 30, sourceCutId: 'cut' },
        { productId: 'book-2', students: 25, suggested: 25, sourceCutId: 'cut' },
      ] }))
    }
    if (url === '/api/cuadernillos/remitos' && init?.method === 'POST') return Promise.resolve(post())
    return Promise.resolve(response({ error: 'unexpected' }, 500))
  })
}

async function addSchoolByCue() {
  fireEvent.change(screen.getByLabelText('Buscar escuela'), { target: { value: '180123' } })
  fireEvent.click(await screen.findByRole('button', { name: /Agregar Escuela A/ }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Revisar' })).toBeEnabled())
}

async function pickCabecera() {
  fireEvent.click(await screen.findByRole('button', { name: 'Directo a cabecera' }))
  fireEvent.change(await screen.findByLabelText('Buscar cabecera'), { target: { value: 'norte' } })
  fireEvent.click(await screen.findByRole('button', { name: /Elegir Cabecera Norte/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
}

/** Cabecera mode: pick the cabecera and land on the per-grade quantities. */
async function goToReserve() {
  await pickCabecera()
  await screen.findByText('¿Cuántos cuadernillos?')
}

/** Directo mode: land on the schools step with one school added. */
async function goToQuantities() {
  fireEvent.click(await screen.findByRole('button', { name: 'Directo a la escuela afectada' }))
  await addSchoolByCue()
}

const reservePosts = (fetchMock: ReturnType<typeof mockFetch>) =>
  fetchMock.mock.calls.filter(([url, init]) => url === '/api/cuadernillos/remitos' && init?.method === 'POST')

function renderBuilder(overrides: Partial<{ onDispatched: () => void; products: typeof products }> = {}) {
  return render(<RemitoBuilder open campaignId="campaign-1" products={overrides.products ?? products} onClose={() => undefined} onDispatched={overrides.onDispatched ?? (() => undefined)} />)
}

describe('RemitoBuilder', () => {
  it('sends a reserve: one stepper per grade, no schools, and the reserve body in the POST', async () => {
    const onDispatched = vi.fn()
    const fetchMock = mockFetch(() => response({ remito: { remitoId: 'r1' } }, 201))
    vi.stubGlobal('fetch', fetchMock)

    renderBuilder({ onDispatched })
    await goToReserve()
    expect(screen.getByText('Paso 3 de 4')).toBeInTheDocument()
    expect(screen.queryByLabelText('Buscar escuela')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Cuadernillo 1.er grado')).toHaveValue(0)
    expect(screen.getByLabelText('Cuadernillo 2.º grado')).toHaveValue(0)
    expect(screen.getByText('(quedan 100)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Revisar' })).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Cuadernillo 1.er grado'), { target: { value: '40' } })
    fireEvent.change(screen.getByLabelText('Cuadernillo 2.º grado'), { target: { value: '10' } })
    expect(screen.getByText('50')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Revisar' }))

    const receipt = await screen.findByRole('region', { name: 'Detalle del envío' })
    expect(screen.getByText('Paso 4 de 4')).toBeInTheDocument()
    expect(receipt).toHaveTextContent('Envío aCabecera Norte')
    expect(receipt).toHaveTextContent('1.er grado40')
    expect(receipt).toHaveTextContent('2.º grado10')
    expect(receipt).toHaveTextContent('La cabecera los reparte entre sus escuelas en estado crítico.')
    expect(receipt).toHaveTextContent('Total50 cuadernillos')
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))

    await waitFor(() => expect(onDispatched).toHaveBeenCalled())
    const body = JSON.parse(String(reservePosts(fetchMock)[0][1].body))
    expect(body).toEqual({
      campaignId: 'campaign-1', modo: 'cabecera', cabeceraCueAnexo: '180000000', reserve: true, idempotencyKey: expect.any(String),
      items: [{ productId: 'book-1', quantity: 40 }, { productId: 'book-2', quantity: 10 }],
    })
    expect(body).not.toHaveProperty('lines')
    const urls = fetchMock.mock.calls.map(([url]) => String(url))
    expect(urls.some((url) => url.startsWith('/api/cuadernillos/schools') || url.startsWith('/api/cuadernillos/recommendations'))).toBe(false)
  })

  it('stops a reserve that exceeds the stock before the review', async () => {
    const fetchMock = mockFetch(() => response({ remito: {} }, 201))
    vi.stubGlobal('fetch', fetchMock)
    renderBuilder()
    await goToReserve()
    fireEvent.change(screen.getByLabelText('Cuadernillo 2.º grado'), { target: { value: '31' } })

    expect(screen.getByRole('alert')).toHaveTextContent('No alcanza el stock de 2.º grado. Bajá las cantidades para poder enviar.')
    expect(screen.getByRole('button', { name: 'Revisar' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Cuadernillo 2.º grado'), { target: { value: '30' } })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Revisar' })).toBeEnabled()
    expect(reservePosts(fetchMock)).toHaveLength(0)
  })

  it('lists in the reserve review only the grades being sent', async () => {
    vi.stubGlobal('fetch', mockFetch(() => response({ remito: {} }, 201)))
    renderBuilder()
    await goToReserve()
    fireEvent.change(screen.getByLabelText('Cuadernillo 1.er grado'), { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { name: 'Revisar' }))
    const receipt = await screen.findByRole('region', { name: 'Detalle del envío' })
    expect(receipt).toHaveTextContent('1.er grado12')
    expect(receipt).not.toHaveTextContent('2.º grado')
  })

  it('picks one cabecera by name or CUE with the same search the schools use, never offering unconfirmed ones', async () => {
    vi.stubGlobal('fetch', mockFetch(() => response({ remito: {} }, 201)))
    renderBuilder()
    fireEvent.click(await screen.findByRole('button', { name: 'Directo a cabecera' }))

    const search = await screen.findByLabelText('Buscar cabecera')
    expect(screen.queryByRole('button', { name: /Cabecera Norte/ })).not.toBeInTheDocument()
    fireEvent.change(search, { target: { value: 'sin cuenta' } })
    expect(await screen.findByText('Ninguna cabecera coincide con la búsqueda.')).toBeInTheDocument()
    fireEvent.change(search, { target: { value: '1800-000' } })
    fireEvent.click(await screen.findByRole('button', { name: /Elegir Cabecera Norte/ }))

    expect(screen.queryByLabelText('Buscar cabecera')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar' }))
    expect(screen.getByLabelText('Buscar cabecera')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled()
  })

  it('searches schools by name as well as CUE', async () => {
    const fetchMock = mockFetch(() => response({ remito: {} }, 201))
    vi.stubGlobal('fetch', fetchMock)
    renderBuilder()
    fireEvent.click(await screen.findByRole('button', { name: 'Directo a la escuela afectada' }))
    fireEvent.change(await screen.findByLabelText('Buscar escuela'), { target: { value: 'Escuela A' } })
    await screen.findByRole('button', { name: /Agregar Escuela A/ })
    const urls = fetchMock.mock.calls.map(([url]) => String(url)).filter((url) => url.startsWith('/api/cuadernillos/schools'))
    expect(urls).toEqual(['/api/cuadernillos/schools?q=Escuela%20A'])
  })

  it('keeps the same idempotency key when the dispatch is retried', async () => {
    let calls = 0
    const fetchMock = mockFetch(() => (++calls === 1 ? response({ error: 'remito_dispatch_failed' }, 503) : response({ remito: {} }, 201)))
    vi.stubGlobal('fetch', fetchMock)
    const onDispatched = vi.fn()

    renderBuilder({ onDispatched })
    await goToReserve()
    fireEvent.change(screen.getByLabelText('Cuadernillo 1.er grado'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Revisar' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Enviar' }))
    expect(await screen.findByText('No se pudo enviar. Intentá nuevamente.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))

    await waitFor(() => expect(onDispatched).toHaveBeenCalled())
    const keys = fetchMock.mock.calls
      .filter(([url, init]) => url === '/api/cuadernillos/remitos' && init?.method === 'POST')
      .map(([, init]) => JSON.parse(String(init.body)).idempotencyKey)
    expect(keys).toHaveLength(2)
    expect(keys[0]).toBe(keys[1])
  })

  it('names the school in plain words when it is no longer a priority', async () => {
    vi.stubGlobal('fetch', mockFetch(() => response({ error: 'recipients_not_critical', recipientCueAnexos: ['180123457'] }, 409)))

    renderBuilder()
    await goToQuantities()
    fireEvent.click(screen.getByRole('button', { name: 'Revisar' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Enviar' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('La Escuela A ya no figura como prioritaria, quitala del envío.')
    expect(alert).not.toHaveTextContent(/recipients_not_critical|severidad|Crítica/)
  })

  it('tells how much stock is left when the server reports insufficient stock', async () => {
    vi.stubGlobal('fetch', mockFetch(() => response({ error: 'insufficient_stock', productIds: ['book-2'] }, 409)))

    renderBuilder()
    await goToReserve()
    fireEvent.change(screen.getByLabelText('Cuadernillo 2.º grado'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Revisar' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Enviar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No alcanza el stock de 2.º grado: quedan 30.')
  })

  it('explains in plain words that the cabecera has no confirmed account yet', async () => {
    vi.stubGlobal('fetch', mockFetch(() => response({ error: 'authority_unavailable' }, 409)))

    renderBuilder()
    await goToReserve()
    fireEvent.change(screen.getByLabelText('Cuadernillo 1.er grado'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Revisar' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Enviar' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('La escuela cabecera todavía no confirmó su cuenta para recibir envíos.')
    expect(alert).not.toHaveTextContent('authority_unavailable')
  })

  it('asks one question per step: two ways to send, then search, with only Atrás plus one primary action', async () => {
    vi.stubGlobal('fetch', mockFetch(() => response({ remito: {} }, 201)))

    renderBuilder()
    expect(await screen.findByText('¿Cómo querés enviarlo?')).toBeInTheDocument()
    expect(screen.getByText('Paso 1 de 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Directo a cabecera' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Directo a la escuela afectada' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Siguiente' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Directo a cabecera' }))
    expect(await screen.findByText('¿A qué cabecera?')).toBeInTheDocument()
    expect(screen.getByText('Paso 2 de 4')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Atrás' }))
    expect(screen.getByText('¿Cómo querés enviarlo?')).toBeInTheDocument()

    await pickCabecera()
    expect(screen.getByText('¿Cuántos cuadernillos?')).toBeInTheDocument()
    expect(screen.getByText('Paso 3 de 4')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Cuadernillo 1.er grado'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Revisar' }))
    expect(await screen.findByRole('region', { name: 'Detalle del envío' })).toBeInTheDocument()
    expect(screen.getByText('Paso 4 de 4')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Atrás' }))
    expect(screen.getByText('Paso 3 de 4')).toBeInTheDocument()
  })

  it('shows the school name first and the CUE as secondary text', async () => {
    vi.stubGlobal('fetch', mockFetch(() => response({ remito: {} }, 201)))

    renderBuilder()
    await goToQuantities()

    const group = screen.getByRole('group', { name: 'Escuela A' })
    expect(group).toHaveTextContent('CUE 1801234-57')
  })

  it('blocks the dispatch in the review when the totals exceed the stock', async () => {
    const fetchMock = mockFetch(() => response({ remito: {} }, 201))
    vi.stubGlobal('fetch', fetchMock)

    renderBuilder({ products: [products[0], { ...products[1], available: 20 }] })
    await goToQuantities()
    // The recommendation for 2.º grado is 25 but only 20 are in stock.
    fireEvent.click(screen.getByRole('button', { name: 'Revisar' }))

    expect(await screen.findByText(/No alcanza el stock: 2\.º grado \(quedan 20, pediste 25\)/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled()
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  })

  it('flags a grade that runs out while loading quantities', async () => {
    vi.stubGlobal('fetch', mockFetch(() => response({ remito: {} }, 201)))

    renderBuilder({ products: [products[0], { ...products[1], available: 20 }] })
    await goToQuantities()

    expect(screen.getByRole('alert')).toHaveTextContent('No alcanza el stock de 2.º grado. Bajá las cantidades para poder enviar.')
    expect(screen.getByLabelText('Total para Escuela A')).toHaveTextContent('55')
    expect(screen.getByRole('button', { name: 'Revisar' })).toBeEnabled()
  })

  it('lists in the review only what is being sent, like a receipt', async () => {
    vi.stubGlobal('fetch', mockFetch(() => response({ remito: {} }, 201)))
    renderBuilder()
    await goToQuantities()
    fireEvent.change(screen.getByLabelText('Escuela A · Cuadernillo 2.º grado'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Revisar' }))
    const receipt = await screen.findByRole('region', { name: 'Detalle del envío' })
    expect(receipt).toHaveTextContent('1.er grado30')
    expect(receipt).not.toHaveTextContent('2.º grado')
    expect(receipt).toHaveTextContent('Total30 cuadernillos')
  })

  it('sends directly to schools: no cabecera step, recommendations without a cabecera, and modo directo in the POST', async () => {
    const onDispatched = vi.fn()
    const fetchMock = mockFetch(() => response({ remito: { remitoId: 'r2' } }, 201))
    vi.stubGlobal('fetch', fetchMock)

    renderBuilder({ onDispatched })
    fireEvent.click(await screen.findByRole('button', { name: 'Directo a la escuela afectada' }))
    await addSchoolByCue()
    fireEvent.click(screen.getByRole('button', { name: 'Revisar' }))

    const receipt = await screen.findByRole('region', { name: 'Detalle del envío' })
    expect(receipt).toHaveTextContent('Sin cabecera: cada escuela firma su recepción')
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))

    await waitFor(() => expect(onDispatched).toHaveBeenCalled())
    const post = fetchMock.mock.calls.find(([url, init]) => url === '/api/cuadernillos/remitos' && init?.method === 'POST')!
    const body = JSON.parse(String(post[1].body))
    expect(body).toEqual({
      campaignId: 'campaign-1', modo: 'directo', idempotencyKey: expect.any(String),
      lines: [{ recipientCueAnexo: '180123457', items: [{ productId: 'book-1', quantity: 30 }, { productId: 'book-2', quantity: 25 }] }],
    })
    expect(body).not.toHaveProperty('cabeceraCueAnexo')
    const recommendation = String(fetchMock.mock.calls.find(([url]) => String(url).startsWith('/api/cuadernillos/recommendations'))![0])
    expect(recommendation).not.toContain('cabeceraCueAnexo')
  })
})
