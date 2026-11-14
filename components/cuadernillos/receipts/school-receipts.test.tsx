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

describe('SchoolReceipts', () => {
  it('separates pending, en camino and history; en camino cannot be signed', async () => {
    setup()
    render(<SchoolReceipts />)
    const pending = within(await screen.findByRole('region', { name: 'Pendientes' }))
    expect(pending.getByText('¿Recibió 28 cuadernillos de 1° grado?')).toBeTruthy()
    const transit = within(screen.getByRole('region', { name: 'En camino' }))
    expect(transit.getByText(/la cabecera tiene que recibir el envío primero/)).toBeTruthy()
    expect(transit.queryByRole('button')).toBeNull()
    const history = within(screen.getByRole('region', { name: 'Historial' }))
    expect(history.getByText(/Firmado por Dir. Escuela/)).toBeTruthy()
    expect(history.queryByRole('button')).toBeNull()
  })

  it('posts the cabecera-confirmed quantity to the line endpoint without identity', async () => {
    const fetchMock = setup()
    render(<SchoolReceipts />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, recibí' }))
    fireEvent.click(screen.getByRole('button', { name: 'Firmar recibido' }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true))
    const [url, init] = fetchMock.mock.calls.find(([, i]) => i?.method === 'POST')!
    expect(url).toBe('/api/cuadernillos/remito-lineas/pend/recibir')
    expect(JSON.parse(String(init?.body))).toEqual({ idempotencyKey: 'key-1', items: [{ productId: 'p1', receivedQuantity: 28 }] })
  })

  it('requires a motivo on a shortfall and shows a 409 error', async () => {
    const fetchMock = setup(() => json({ error: 'cabecera_receipt_pending' }, false))
    render(<SchoolReceipts />)
    fireEvent.click(await screen.findByRole('button', { name: 'No, recibí otra cantidad' }))
    fireEvent.change(screen.getByLabelText('Cantidad recibida · pend · 1° grado'), { target: { value: '20' } })
    const sign = screen.getByRole('button', { name: 'Firmar recibido' })
    expect(sign).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Se perdieron' } })
    fireEvent.click(sign)
    expect(await screen.findByText(/La cabecera todavía no firmó/)).toBeTruthy()
    const init = fetchMock.mock.calls.find(([, i]) => i?.method === 'POST')![1]
    expect(JSON.parse(String(init?.body))).toEqual({ idempotencyKey: 'key-1', items: [{ productId: 'p1', receivedQuantity: 20 }], shortfallReason: 'Se perdieron' })
  })
})
