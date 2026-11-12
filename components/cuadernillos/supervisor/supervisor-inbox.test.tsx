// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { SupervisorInbox } from './supervisor-inbox'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const pending = {
  requestId: 'request-1', rootRequestId: 'request-1', recipientCueAnexo: '180123457', recipientName: 'Escuela Anexo',
  cabeceraCueAnexo: '180123456', cabeceraName: 'Escuela Cabecera', status: 'pending' as const,
  requested: [{ productId: 'book-a', productLabel: 'Cuadernillo A', quantity: 12 }],
  approved: [], remaining: [], submittedAt: new Date(Date.now() - 2 * 3600_000).toISOString(), approvedAt: null, approvalIdentity: null,
}

const otherCabecera = {
  ...pending, requestId: 'request-2', rootRequestId: 'request-2', recipientName: 'Escuela Dos', recipientCueAnexo: '180555551',
  cabeceraCueAnexo: '180555550', cabeceraName: 'Cabecera Norte',
}

const decided = {
  ...pending, requestId: 'request-3', rootRequestId: 'request-3', recipientName: 'Escuela Decidida', status: 'rejected' as const,
}

function response(body: unknown, ok = true) {
  return { ok, json: async () => body }
}

function listResponse(requests: unknown[]) {
  return response({ campaignId: 'campaign-1', campaignOptions: [], requests, hasMore: false, nextCursor: null })
}

function overviewResponse(balances: unknown[] = []) {
  return response({ capability: 'supervisor', campaignId: 'campaign-1', balances, requests: [], eligibility: null })
}

function postTo(fetchMock: unknown, suffix: string) {
  const calls = (fetchMock as { mock: { calls: unknown[] } }).mock.calls as Array<[string, RequestInit]>
  const call = calls.find(([url]) => url.endsWith(suffix))
  if (!call) throw new Error(`no request to ${suffix}`)
  return { url: call[0], init: call[1], body: JSON.parse(String(call[1].body)) as Record<string, unknown> }
}

function mockApi(routes: { list: unknown; overview?: unknown; decide?: unknown }) {
  return vi.fn(async (url: string) => {
    if (url.startsWith('/api/cuadernillos/overview')) return routes.overview ?? overviewResponse()
    if (url.includes('/approve') || url.includes('/reject')) return routes.decide ?? response({ ok: true })
    return routes.list
  })
}

describe('SupervisorInbox', () => {
  it('groups pending requests by cabecera with counts and keeps decided ones in a collapsed history', async () => {
    vi.stubGlobal('fetch', mockApi({ list: listResponse([pending, otherCabecera, decided]) }))

    render(<SupervisorInbox isAdmin={false} readOnly={false} />)

    const groupA = await screen.findByRole('group', { name: /Escuela Cabecera/ })
    expect(within(groupA).getByText('1 pendiente')).toBeInTheDocument()
    expect(within(groupA).getByText('Escuela Anexo')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: /Cabecera Norte/ })).toBeInTheDocument()
    expect(screen.getAllByText('hace 2 h')).toHaveLength(2)

    const history = screen.getByText('Historial').closest('details')
    expect(history).not.toBeNull()
    expect(history).not.toHaveAttribute('open')
    expect(within(history!).getByText('Escuela Decidida')).toBeInTheDocument()
  })

  it('shows the empty state when nothing is pending', async () => {
    vi.stubGlobal('fetch', mockApi({ list: listResponse([decided]) }))

    render(<SupervisorInbox isAdmin={false} readOnly={false} />)

    expect(await screen.findByText('No hay pedidos pendientes')).toBeInTheDocument()
  })

  it('posts the approval with the default quantities and then with edited quantities', async () => {
    const fetchMock = mockApi({ list: listResponse([pending]), decide: response({ error: 'authority_unavailable' }, false) })
    vi.stubGlobal('fetch', fetchMock)

    render(<SupervisorInbox isAdmin={false} readOnly={false} />)

    fireEvent.click(await screen.findByRole('button', { name: /Escuela Anexo/ }))
    const quantity = await screen.findByLabelText('Cantidad aprobada · Cuadernillo A')
    expect(quantity).toHaveValue(12)
    fireEvent.change(quantity, { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar aprobación' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/no está disponible/i)
    const { url, init, body } = postTo(fetchMock, '/approve')
    expect(url).toBe('/api/cuadernillos/requests/request-1/approve')
    expect(init).toEqual(expect.objectContaining({ method: 'POST', headers: { 'Content-Type': 'application/json' } }))
    expect(body).toEqual({ lines: [{ productId: 'book-a', quantity: 5 }], idempotencyKey: expect.any(String) })
    expect(body).not.toHaveProperty('signerUserId')
    expect(body).not.toHaveProperty('approvedByUserId')
  })

  it('requires a reason before rejecting and posts it with the idempotency key', async () => {
    const fetchMock = mockApi({ list: listResponse([pending]), decide: response({ error: 'authority_unavailable' }, false) })
    vi.stubGlobal('fetch', fetchMock)

    render(<SupervisorInbox isAdmin={false} readOnly={false} />)

    fireEvent.click(await screen.findByRole('button', { name: /Escuela Anexo/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Rechazar' }))
    const reject = screen.getByRole('button', { name: 'Rechazar solicitud' })
    expect(reject).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Motivo del rechazo'), { target: { value: 'Solicitud duplicada' } })
    expect(reject).toBeEnabled()
    fireEvent.click(reject)

    expect(await screen.findByRole('alert')).toHaveTextContent(/no se modificó la solicitud/i)
    const { url, body } = postTo(fetchMock, '/reject')
    expect(url).toBe('/api/cuadernillos/requests/request-1/reject')
    expect(body).toEqual({ reason: 'Solicitud duplicada', idempotencyKey: expect.any(String) })
  })

  it('disables every decision in read-only mode', async () => {
    vi.stubGlobal('fetch', mockApi({ list: listResponse([pending]) }))

    render(<SupervisorInbox isAdmin readOnly viewAsUserId="user-2" />)

    fireEvent.click(await screen.findByRole('button', { name: /Escuela Anexo/ }))
    expect(await screen.findByText(/Solo lectura/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Aprobar' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Rechazar' })).toBeDisabled()
  })

  it('sends the view-as account to the requests endpoint', async () => {
    const fetchMock = mockApi({ list: listResponse([]) })
    vi.stubGlobal('fetch', fetchMock)

    render(<SupervisorInbox isAdmin readOnly viewAsUserId="user-2" />)

    await screen.findByText('No hay pedidos pendientes')
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('viewAs=user-2'), expect.anything())
  })
})
