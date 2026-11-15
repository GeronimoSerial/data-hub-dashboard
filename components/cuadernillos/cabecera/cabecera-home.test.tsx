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
  fireEvent.click(await screen.findByRole('button', { name: 'Sí, llegó todo' }))
}

const SIGN = 'Confirmo que recibí estos cuadernillos'

describe('CabeceraHome receipt view', () => {
  beforeEach(() => {
    let n = 0
    vi.stubGlobal('crypto', { randomUUID: () => `key-${++n}` })
  })

  it('opens with the task card, lists products per school and keeps history collapsed and read-only', async () => {
    setup()
    render(<CabeceraHome />)

    expect(await screen.findByText('Tenés 1 envío para recibir.')).toBeTruthy()
    expect(screen.getByText('1° grado: 30 · 2° grado: 25')).toBeTruthy()
    expect(screen.getByText('1° grado: 18')).toBeTruthy()
    expect(screen.queryByText(/Un solo recibido/)).toBeNull()
    expect(document.body.textContent).not.toMatch(/remito|despach|tramo|faltante|Crítica/i)
    const details = document.querySelector('details') as HTMLDetailsElement
    expect(details.open).toBe(false)
    const history = within(screen.getByRole('region', { name: 'Historial', hidden: true }))
    expect(history.getByText(/Confirmado por Ana Cabecera/)).toBeTruthy()
    expect(history.getByText('Qué pasó: Caja rota')).toBeTruthy()
    expect(history.queryByRole('button', { name: SIGN })).toBeNull()
  })

  it('pluralizes the task card and says nothing is pending', async () => {
    setup(undefined, [pendingRemito, { ...pendingRemito, remitoId: 'remito-2' }])
    render(<CabeceraHome />)
    expect(await screen.findByText('Tenés 2 envíos para recibir.')).toBeTruthy()
    cleanup()
    setup(undefined, [signedRemito])
    render(<CabeceraHome />)
    expect(await screen.findByText('No tenés nada pendiente.')).toBeTruthy()
  })

  it('shows the circuit guide when there are no envíos', async () => {
    setup(undefined, [])
    render(<CabeceraHome />)
    expect(await screen.findByText('No tenés nada pendiente.')).toBeTruthy()
    expect(screen.getByRole('complementary', { name: 'Cómo funciona' })).toBeTruthy()
  })

  it('shows the journey with who and when for each step', async () => {
    setup()
    render(<CabeceraHome />)
    await screen.findByText('Tenés 1 envío para recibir.')
    const pending = within(screen.getByRole('region', { name: 'Pendientes' }))
    const journey = within(pending.getByRole('list', { name: 'Recorrido del envío' }))
    expect(journey.getByText('Enviado')).toBeTruthy()
    expect(journey.getByText(/^Planeamiento · /)).toBeTruthy()
    expect(journey.getByText('Llegó a la cabecera').closest('li')?.getAttribute('data-state')).toBe('current')
    expect(journey.getByText('Llegó a la escuela').closest('li')?.getAttribute('data-state')).toBe('pending')

    const done = within(within(screen.getByRole('region', { name: 'Historial', hidden: true })).getByRole('list', { name: 'Recorrido del envío', hidden: true }))
    expect(done.getByText('Llegó a la cabecera').closest('li')?.getAttribute('data-state')).toBe('short')
    expect(done.getByText(/^Ana Cabecera · /)).toBeTruthy()
  })

  it('keeps signing disabled until answered, then "Sí, llegó todo" posts full quantities and retries with the same key', async () => {
    const fetchMock = setup(() => json({ error: 'cabecera_receipt_pending' }, false))
    render(<CabeceraHome />)
    const sign = await screen.findByRole('button', { name: SIGN })
    expect(sign).toBeDisabled()

    await confirmAll()
    expect(sign).toBeEnabled()
    expect(screen.getByText('Llegaron los 73 cuadernillos')).toBeTruthy()
    fireEvent.click(sign)
    await screen.findByText(/La cabecera todavía no confirmó/)
    fireEvent.click(sign)
    await waitFor(() => expect(posts(fetchMock)).toHaveLength(2))

    const [url, init] = posts(fetchMock)[0]
    expect(url).toBe('/api/cuadernillos/remitos/remito-1/recibir')
    expect(JSON.parse(String(init?.body))).toEqual({
      idempotencyKey: 'key-1',
      lines: [
        { lineId: 'line-own', items: [{ productId: 'p1', receivedQuantity: 30 }, { productId: 'p2', receivedQuantity: 25 }] },
        { lineId: 'line-b', items: [{ productId: 'p1', receivedQuantity: 18 }] },
      ],
    })
    expect(JSON.parse(String(posts(fetchMock)[1][1]?.body)).idempotencyKey).toBe('key-1')
  })

  it('"Llegó menos" reveals bounded quantities and a required motivo, and posts the reason', async () => {
    const fetchMock = setup()
    render(<CabeceraHome />)
    await screen.findByText('Tenés 1 envío para recibir.')
    expect(screen.queryByLabelText(/Cantidad recibida/)).toBeNull()
    await confirmAll()
    fireEvent.click(screen.getByRole('button', { name: /^Llegó menos · Escuela B/ }))
    const quantity = screen.getByLabelText('Cantidad recibida · line-b · 1° grado')
    expect(screen.queryByLabelText('Cantidad recibida · line-own · 1° grado')).toBeNull()
    fireEvent.change(quantity, { target: { value: '99' } })
    expect((quantity as HTMLInputElement).value).toBe('18')
    fireEvent.change(quantity, { target: { value: '12' } })

    const sign = screen.getByRole('button', { name: SIGN })
    expect(sign).toBeDisabled()
    fireEvent.change(screen.getByLabelText('¿Qué pasó?'), { target: { value: 'Faltaron 6' } })
    expect(sign).toBeEnabled()
    fireEvent.click(sign)

    await waitFor(() => expect(posts(fetchMock)).toHaveLength(1))
    const body = JSON.parse(String(posts(fetchMock)[0][1]?.body))
    expect(body.lines[1]).toEqual({ lineId: 'line-b', items: [{ productId: 'p1', receivedQuantity: 12 }], shortfallReason: 'Faltaron 6' })
    expect(body.lines[0]).not.toHaveProperty('shortfallReason')
    expect(JSON.stringify(body)).not.toMatch(/signer|userId|identity/i)
  })

  it('shows the API error for a rejected receipt in plain Spanish', async () => {
    const fetchMock = setup(() => json({ error: 'already_received' }, false))
    render(<CabeceraHome />)
    await confirmAll()
    fireEvent.click(screen.getByRole('button', { name: SIGN }))
    expect(await screen.findByText(/ya fue confirmado/)).toBeTruthy()
    expect(fetchMock.mock.calls.filter(([url]) => String(url).startsWith('/api/cuadernillos/recepciones'))).toHaveLength(1)
  })
})
