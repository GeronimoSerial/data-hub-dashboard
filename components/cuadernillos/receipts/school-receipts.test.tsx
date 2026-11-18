// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { SchoolReceipts } from './school-receipts'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const json = (body: unknown, ok = true) => ({ ok, json: async () => body })
const base = { remitoId: 'r1', recipientCueAnexo: '180123457', dispatchedAt: '2026-11-10T12:00:00.000Z', cabeceraReceivedBy: null, cabeceraReceivedAt: null, cabeceraShortfallReason: null, schoolReceivedBy: null, schoolReceivedAt: null, schoolShortfallReason: null }
const lines = [
  { ...base, lineId: 'pend', status: 'at_cabecera', cabeceraReceivedBy: { userId: 'u1', name: 'Ana' }, cabeceraReceivedAt: '2026-11-11T12:00:00.000Z',
    items: [{ productId: 'p1', productName: 'Cuadernillo para estudiantes de 1° grado', expectedQuantity: 28, schoolReceivedQuantity: null }] },
  { ...base, lineId: 'transit', status: 'in_transit', items: [{ productId: 'p1', productName: 'Cuadernillo para estudiantes de 1° grado', expectedQuantity: null, schoolReceivedQuantity: null }] },
  { ...base, lineId: 'done', status: 'received', schoolReceivedBy: { userId: 's1', name: 'Dir. Escuela' }, schoolReceivedAt: '2026-11-05T12:00:00.000Z',
    items: [{ productId: 'p1', productName: 'Cuadernillo para estudiantes de 1° grado', expectedQuantity: 10, schoolReceivedQuantity: 10 }] },
]

function setup(post: () => unknown = () => json({ receipt: {} })) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') return post()
    return json({ kind: 'school', lines })
  })
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('crypto', { randomUUID: () => 'key-1' })
  return fetchMock
}

const SIGN = 'Confirmo que recibí estos cuadernillos'

describe('SchoolReceipts', () => {
  it('opens with the task card, then pending, en camino and collapsed history; en camino cannot be confirmed', async () => {
    setup()
    render(<SchoolReceipts />)
    expect(await screen.findByText('Te llegó un envío de cuadernillos. Confirmá qué recibiste.')).toBeTruthy()
    const pending = within(screen.getByRole('region', { name: 'Pendientes' }))
    expect(pending.getByText('1° grado: 28')).toBeTruthy()
    const transit = within(screen.getByRole('region', { name: 'En camino' }))
    expect(transit.getByText(/primero tiene que llegar a la cabecera/)).toBeTruthy()
    expect(transit.queryByRole('button')).toBeNull()
    expect((document.querySelector('details') as HTMLDetailsElement).open).toBe(false)
    const history = within(screen.getByRole('region', { name: 'Historial', hidden: true }))
    expect(history.getByText(/Confirmado por Dir. Escuela/)).toBeTruthy()
    expect(history.queryByRole('button')).toBeNull()
    expect(document.body.textContent).not.toMatch(/remito|despach|tramo|faltante|Crítica/i)
  })

  it('shows the task card for no pending envíos and the circuit guide when empty', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ kind: 'school', lines: [] })))
    render(<SchoolReceipts />)
    expect(await screen.findByText('No tenés nada pendiente.')).toBeTruthy()
    expect(screen.getByRole('complementary', { name: 'Cómo funciona' })).toBeTruthy()
  })

  it('pluralizes the task card for several pending envíos', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ kind: 'school', lines: [lines[0], { ...lines[0], lineId: 'pend2' }] })))
    render(<SchoolReceipts />)
    expect(await screen.findByText('Te llegaron 2 envíos de cuadernillos. Confirmá qué recibiste.')).toBeTruthy()
  })

  it('shows the journey with who confirmed each step in the history', async () => {
    setup()
    render(<SchoolReceipts />)
    await screen.findByRole('region', { name: 'Pendientes' })
    const done = within(within(screen.getByRole('region', { name: 'Historial', hidden: true })).getByRole('list', { name: 'Recorrido del envío', hidden: true }))
    expect(done.getByText('Llegó a la escuela').closest('li')?.getAttribute('data-state')).toBe('done')
    expect(done.getByText(/^Dir. Escuela · /)).toBeTruthy()
  })

  it('"Sí, llegó todo" posts the cabecera-confirmed quantity to the line endpoint without identity', async () => {
    const fetchMock = setup()
    render(<SchoolReceipts />)
    await screen.findByText('¿Llegó todo a tu escuela?')
    expect(screen.queryByRole('button', { name: SIGN })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Sí, llegó todo' }))
    expect(screen.queryByLabelText(/Cantidad recibida/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: SIGN }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true))
    const [url, init] = fetchMock.mock.calls.find(([, i]) => i?.method === 'POST')!
    expect(url).toBe('/api/cuadernillos/remito-lineas/pend/recibir')
    expect(JSON.parse(String(init?.body))).toEqual({ idempotencyKey: 'key-1', items: [{ productId: 'p1', receivedQuantity: 28 }] })
  })

  it('"Llegó menos" reveals quantities and a required motivo, and shows a 409 error', async () => {
    const fetchMock = setup(() => json({ error: 'cabecera_receipt_pending' }, false))
    render(<SchoolReceipts />)
    expect(screen.queryByLabelText('¿Qué pasó?')).toBeNull()
    fireEvent.click(await screen.findByRole('button', { name: 'Llegó menos' }))
    fireEvent.change(screen.getByLabelText('Cantidad recibida · pend · 1° grado'), { target: { value: '20' } })
    const next = screen.getByRole('button', { name: 'Siguiente' })
    expect(next).toBeDisabled()
    fireEvent.change(screen.getByLabelText('¿Qué pasó?'), { target: { value: 'Se perdieron' } })
    fireEvent.click(next)
    expect(screen.getByText('Llegaron 20 de 28 cuadernillos')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: SIGN }))
    expect(await screen.findByText(/La cabecera todavía no confirmó/)).toBeTruthy()
    const init = fetchMock.mock.calls.find(([, i]) => i?.method === 'POST')![1]
    expect(JSON.parse(String(init?.body))).toEqual({ idempotencyKey: 'key-1', items: [{ productId: 'p1', receivedQuantity: 20 }], shortfallReason: 'Se perdieron' })
  })
})

describe('SchoolReceipts for a directo line', () => {
  const direct = {
    ...base, lineId: 'direct', modo: 'directo', cabeceraCueAnexo: null, status: 'in_transit',
    items: [{ productId: 'p1', productName: 'Cuadernillo para estudiantes de 1° grado', expectedQuantity: 12, schoolReceivedQuantity: null }],
  }

  function setupDirect() {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => (init?.method === 'POST' ? json({ receipt: {} }) : json({ kind: 'school', lines: [direct] })))
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('crypto', { randomUUID: () => 'key-1' })
    return fetchMock
  }

  it('is signable while in transit, shows the dispatched quantity and has no cabecera step', async () => {
    const fetchMock = setupDirect()
    render(<SchoolReceipts />)

    const pending = within(await screen.findByRole('region', { name: 'Pendientes' }))
    expect(pending.getByText('1° grado: 12')).toBeTruthy()
    expect(pending.queryByText('Llegó a la cabecera')).toBeNull()
    expect(screen.queryByRole('region', { name: 'En camino' })).toBeNull()

    fireEvent.click(pending.getByRole('button', { name: 'Sí, llegó todo' }))
    fireEvent.click(pending.getByRole('button', { name: SIGN }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true))
    const [url, init] = fetchMock.mock.calls.find(([, i]) => i?.method === 'POST')!
    expect(url).toBe('/api/cuadernillos/remito-lineas/direct/recibir')
    expect(JSON.parse(String(init?.body))).toEqual({ idempotencyKey: 'key-1', items: [{ productId: 'p1', receivedQuantity: 12 }] })
  })

  it('words the shortfall reason as the leg Planeamiento → Escuela', async () => {
    setupDirect()
    render(<SchoolReceipts />)

    fireEvent.click(await screen.findByRole('button', { name: 'Llegó menos' }))
    fireEvent.change(screen.getByLabelText('Cantidad recibida · direct · 1° grado'), { target: { value: '9' } })
    expect(screen.getByLabelText('¿Qué pasó en el tramo Planeamiento → Escuela?')).toBeTruthy()
  })
})
