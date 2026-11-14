// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { CabeceraHome } from './cabecera-home'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const json = (body: unknown, ok = true) => ({ ok, json: async () => body })

const item = (productId: string, productName: string, dispatchedQuantity: number) => ({ productId, productName, dispatchedQuantity, cabeceraReceivedQuantity: null })
const pendingRemito = {
  remitoId: 'remito-1', campaignId: 'c1', cabeceraCueAnexo: '180123456', status: 'dispatched',
  dispatchedAt: '2026-11-10T12:00:00.000Z', cabeceraReceivedBy: null, cabeceraReceivedAt: null,
  lines: [
    { lineId: 'line-own', recipientCueAnexo: '180123456', recipientName: 'Escuela Cabecera', status: 'in_transit', cabeceraShortfallReason: null, schoolReceivedBy: null, schoolReceivedAt: null, schoolShortfallReason: null,
      items: [item('p1', 'Cuadernillo para estudiantes de 1° grado', 30), item('p2', 'Cuadernillo para estudiantes de 2° grado', 25)] },
    { lineId: 'line-b', recipientCueAnexo: '180123457', recipientName: 'Escuela B', status: 'in_transit', cabeceraShortfallReason: null, schoolReceivedBy: null, schoolReceivedAt: null, schoolShortfallReason: null,
      items: [item('p1', 'Cuadernillo para estudiantes de 1° grado', 18)] },
  ],
}
const signedRemito = {
  ...pendingRemito, remitoId: 'remito-0', status: 'received', cabeceraReceivedBy: { userId: 'u1', name: 'Ana Cabecera' }, cabeceraReceivedAt: '2026-11-01T12:00:00.000Z',
  lines: [{ ...pendingRemito.lines[1], lineId: 'line-c', status: 'at_cabecera', items: [{ ...item('p1', 'Cuadernillo para estudiantes de 1° grado', 10), cabeceraReceivedQuantity: 8 }], cabeceraShortfallReason: 'Caja rota' }],
}

function setup(post: () => unknown = () => json({ receipt: { remitoId: 'remito-1' } }), remitos: unknown[] = [pendingRemito, signedRemito]) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') return post()
    if (url.startsWith('/api/cuadernillos/recepciones')) return json({ kind: 'cabecera', remitos })
    return json({})
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const posts = (fetchMock: ReturnType<typeof setup>) => fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')

async function confirmAll() {
  for (const button of await screen.findAllByRole('button', { name: 'Sí, recibí' })) fireEvent.click(button)
}

describe('CabeceraHome receipt view', () => {
  beforeEach(() => {
    let n = 0
    vi.stubGlobal('crypto', { randomUUID: () => `key-${++n}` })
  })

  it('asks per product, notes the own-school line and lists history read-only with signer and time', async () => {
    setup()
    render(<CabeceraHome />)

    expect(await screen.findByText('¿Recibió 30 cuadernillos de 1° grado?')).toBeTruthy()
    expect(screen.getByText('¿Recibió 25 cuadernillos de 2° grado?')).toBeTruthy()
    expect(screen.getAllByText(/Un solo recibido/)).toHaveLength(1)
    const history = within(screen.getByRole('region', { name: 'Historial' }))
    expect(history.getByText(/Firmado por Ana Cabecera/)).toBeTruthy()
    expect(history.getByText('Motivo: Caja rota')).toBeTruthy()
    expect(history.queryByRole('button', { name: 'Firmar recibido' })).toBeNull()
  })

  it('keeps signing disabled until every product is answered, then posts the exact payload and retries with the same key', async () => {
    const fetchMock = setup(() => json({ error: 'cabecera_receipt_pending' }, false))
    render(<CabeceraHome />)
    const sign = await screen.findByRole('button', { name: 'Firmar recibido' })
    expect(sign).toBeDisabled()

    await confirmAll()
    expect(sign).toBeEnabled()
    fireEvent.click(sign)
    await screen.findByText(/La cabecera todavía no firmó/)
    fireEvent.click(sign)
    await waitFor(() => expect(posts(fetchMock)).toHaveLength(2))

    const [url, init] = posts(fetchMock)[0]
    expect(url).toBe('/api/cuadernillos/remitos/remito-1/recibir')
    const body = JSON.parse(String(init?.body))
    expect(body).toEqual({
      idempotencyKey: 'key-1',
      lines: [
        { lineId: 'line-own', items: [{ productId: 'p1', receivedQuantity: 30 }, { productId: 'p2', receivedQuantity: 25 }] },
        { lineId: 'line-b', items: [{ productId: 'p1', receivedQuantity: 18 }] },
      ],
    })
    expect(JSON.parse(String(posts(fetchMock)[1][1]?.body)).idempotencyKey).toBe('key-1')
  })

  it('requires a motivo for a shortfall, bounds the quantity and posts the reason', async () => {
    const fetchMock = setup()
    render(<CabeceraHome />)
    await confirmAll()
    const other = screen.getAllByRole('button', { name: 'No, recibí otra cantidad' })[2]
    fireEvent.click(other)
    const quantity = screen.getByLabelText('Cantidad recibida · line-b · 1° grado')
    fireEvent.change(quantity, { target: { value: '99' } })
    expect((quantity as HTMLInputElement).value).toBe('18')
    fireEvent.change(quantity, { target: { value: '12' } })

    const sign = screen.getByRole('button', { name: 'Firmar recibido' })
    expect(sign).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Faltaron 6' } })
    expect(sign).toBeEnabled()
    fireEvent.click(sign)

    await waitFor(() => expect(posts(fetchMock)).toHaveLength(1))
    const body = JSON.parse(String(posts(fetchMock)[0][1]?.body))
    expect(body.lines[1]).toEqual({ lineId: 'line-b', items: [{ productId: 'p1', receivedQuantity: 12 }], shortfallReason: 'Faltaron 6' })
    expect(body.lines[0]).not.toHaveProperty('shortfallReason')
    expect(JSON.stringify(body)).not.toMatch(/signer|userId|identity/i)
  })

  it('shows the API error for a rejected receipt and refetches after a successful one', async () => {
    const fetchMock = setup(() => json({ error: 'already_received' }, false))
    render(<CabeceraHome />)
    await confirmAll()
    fireEvent.click(screen.getByRole('button', { name: 'Firmar recibido' }))
    expect(await screen.findByText(/ya fue firmado/)).toBeTruthy()
    expect(fetchMock.mock.calls.filter(([url]) => String(url).startsWith('/api/cuadernillos/recepciones'))).toHaveLength(1)
  })
})
