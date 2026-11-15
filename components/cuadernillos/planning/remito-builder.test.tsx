// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

async function goToQuantities() {
  fireEvent.click(await screen.findByRole('button', { name: /Cabecera Norte/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
  fireEvent.change(screen.getByLabelText('Buscar escuela por CUE'), { target: { value: '180123' } })
  fireEvent.click(screen.getByRole('button', { name: 'Buscar escuela' }))
  fireEvent.click(await screen.findByRole('button', { name: /Agregar Escuela A/ }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Revisar' })).toBeEnabled())
}

function renderBuilder(overrides: Partial<{ onDispatched: () => void; products: typeof products }> = {}) {
  return render(<RemitoBuilder open campaignId="campaign-1" products={overrides.products ?? products} onClose={() => undefined} onDispatched={overrides.onDispatched ?? (() => undefined)} />)
}

describe('RemitoBuilder', () => {
  it('offers only confirmed cabeceras and posts the exact payload with prefilled, editable quantities', async () => {
    const onDispatched = vi.fn()
    const fetchMock = mockFetch(() => response({ remito: { remitoId: 'r1' } }, 201))
    vi.stubGlobal('fetch', fetchMock)

    renderBuilder({ onDispatched })
    await goToQuantities()
    expect(screen.queryByText('Cabecera Sin Cuenta')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Escuela A · Cuadernillo 1.er grado')).toHaveValue(30)
    fireEvent.change(screen.getByLabelText('Escuela A · Cuadernillo 2.º grado'), { target: { value: '20' } })
    fireEvent.click(screen.getByRole('button', { name: 'Revisar' }))
    const receipt = await screen.findByRole('region', { name: 'Detalle del envío' })
    expect(receipt).toHaveTextContent('Envío aCabecera Norte')
    expect(receipt).toHaveTextContent('Escuela A')
    expect(receipt).toHaveTextContent('Total50 cuadernillos')
    expect(receipt).not.toHaveTextContent('Stock')
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))

    await waitFor(() => expect(onDispatched).toHaveBeenCalled())
    const post = fetchMock.mock.calls.find(([url, init]) => url === '/api/cuadernillos/remitos' && init?.method === 'POST')!
    const body = JSON.parse(String(post[1].body))
    expect(body).toEqual({
      campaignId: 'campaign-1', cabeceraCueAnexo: '180000000', idempotencyKey: expect.any(String),
      lines: [{ recipientCueAnexo: '180123457', items: [{ productId: 'book-1', quantity: 30 }, { productId: 'book-2', quantity: 20 }] }],
    })
    const recommendation = fetchMock.mock.calls.find(([url]) => String(url).startsWith('/api/cuadernillos/recommendations'))![0]
    expect(recommendation).toContain('cabeceraCueAnexo=180000000')
  })

  it('keeps the same idempotency key when the dispatch is retried', async () => {
    let calls = 0
    const fetchMock = mockFetch(() => (++calls === 1 ? response({ error: 'remito_dispatch_failed' }, 503) : response({ remito: {} }, 201)))
    vi.stubGlobal('fetch', fetchMock)
    const onDispatched = vi.fn()

    renderBuilder({ onDispatched })
    await goToQuantities()
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
    await goToQuantities()
    fireEvent.click(screen.getByRole('button', { name: 'Revisar' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Enviar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No alcanza el stock de 2.º grado: quedan 30.')
  })

  it('explains in plain words that the cabecera has no confirmed account yet', async () => {
    vi.stubGlobal('fetch', mockFetch(() => response({ error: 'authority_unavailable' }, 409)))

    renderBuilder()
    await goToQuantities()
    fireEvent.click(screen.getByRole('button', { name: 'Revisar' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Enviar' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('La escuela cabecera todavía no confirmó su cuenta para recibir envíos.')
    expect(alert).not.toHaveTextContent('authority_unavailable')
  })

  it('shows the three numbered steps and moves the current one forward', async () => {
    vi.stubGlobal('fetch', mockFetch(() => response({ remito: {} }, 201)))

    renderBuilder()
    const steps = await screen.findByRole('list', { name: 'Pasos del envío' })
    const items = () => within(steps).getAllByRole('listitem')
    expect(items().map((item) => item.textContent)).toEqual(['1. ¿A qué cabecera?', '2. ¿Qué escuelas y cuántos?', '3. Revisar y enviar'])
    expect(items()[0]).toHaveAttribute('aria-current', 'step')
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled()

    await goToQuantities()
    expect(items()[1]).toHaveAttribute('aria-current', 'step')
    fireEvent.click(screen.getByRole('button', { name: 'Revisar' }))
    expect(await screen.findByRole('region', { name: 'Detalle del envío' })).toBeInTheDocument()
    expect(items()[2]).toHaveAttribute('aria-current', 'step')
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeEnabled()
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
})
