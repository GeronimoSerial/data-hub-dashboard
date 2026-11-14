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

async function goToQuantities() {
  fireEvent.click(await screen.findByRole('button', { name: /Cabecera Norte/ }))
  fireEvent.change(screen.getByLabelText('CUE de la escuela'), { target: { value: '180123' } })
  fireEvent.click(screen.getByRole('button', { name: 'Buscar escuela' }))
  fireEvent.click(await screen.findByRole('button', { name: /Elegir Escuela A/ }))
  const next = await screen.findByRole('button', { name: 'Siguiente' })
  await waitFor(() => expect(next).toBeEnabled())
  fireEvent.click(next)
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
    expect(await screen.findByRole('list', { name: 'Totales contra stock' })).toHaveTextContent('Despacho 30 · Stock 100')
    fireEvent.click(screen.getByRole('button', { name: 'Despachar remito' }))

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
    fireEvent.click(await screen.findByRole('button', { name: 'Despachar remito' }))
    expect(await screen.findByText('No se pudo despachar el remito. Intentá nuevamente.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Despachar remito' }))

    await waitFor(() => expect(onDispatched).toHaveBeenCalled())
    const keys = fetchMock.mock.calls
      .filter(([url, init]) => url === '/api/cuadernillos/remitos' && init?.method === 'POST')
      .map(([, init]) => JSON.parse(String(init.body)).idempotencyKey)
    expect(keys).toHaveLength(2)
    expect(keys[0]).toBe(keys[1])
  })

  it('lists the schools that are no longer Crítica when the dispatch is refused', async () => {
    vi.stubGlobal('fetch', mockFetch(() => response({ error: 'recipients_not_critical', recipientCueAnexos: ['180123457'] }, 409)))

    renderBuilder()
    await goToQuantities()
    fireEvent.click(screen.getByRole('button', { name: 'Revisar' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Despachar remito' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Escuela A (CUE 180123457)')
  })

  it('names the products without stock when the server reports insufficient stock', async () => {
    vi.stubGlobal('fetch', mockFetch(() => response({ error: 'insufficient_stock', productIds: ['book-2'] }, 409)))

    renderBuilder()
    await goToQuantities()
    fireEvent.click(screen.getByRole('button', { name: 'Revisar' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Despachar remito' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No hay stock suficiente de: Cuadernillo 2.º grado')
  })

  it('blocks the dispatch in the review when the totals exceed the stock', async () => {
    const fetchMock = mockFetch(() => response({ remito: {} }, 201))
    vi.stubGlobal('fetch', fetchMock)

    renderBuilder({ products: [products[0], { ...products[1], available: 20 }] })
    await goToQuantities()
    // The recommendation for 2.º grado is 25 but only 20 are in stock.
    fireEvent.click(screen.getByRole('button', { name: 'Revisar' }))

    expect(await screen.findByText('Faltan 5')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Despachar remito' })).toBeDisabled()
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  })
})
