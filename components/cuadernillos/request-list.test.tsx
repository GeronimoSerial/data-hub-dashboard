// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { RequestList, fichaEscuelaHref } from './request-list'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const summary = {
  requestId: 'request-1', rootRequestId: 'request-1', recipientCueAnexo: '180123457', recipientName: 'Escuela Anexo',
  cabeceraCueAnexo: '180123456', cabeceraName: 'Escuela Cabecera', status: 'pending' as const,
  requested: [{ productId: 'book-a', productLabel: 'Cuadernillo A', quantity: 12 }],
  approved: [], remaining: [{ productId: 'book-a', productLabel: 'Cuadernillo A', quantity: 12 }],
  submittedAt: '2026-11-09T12:00:00.000Z', approvedAt: null, approvalIdentity: null,
}

function response(body: unknown, ok = true) {
  return { ok, json: async () => body }
}

describe('RequestList', () => {
  it('shows server-scoped requests and campaign options without exposing approval actions', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({
      campaignId: 'campaign-1', campaignOptions: [], requests: [summary], hasMore: false, nextCursor: null,
    }))
    vi.stubGlobal('fetch', fetchMock)

    render(<RequestList />)

    expect(await screen.findByText('Escuela Anexo')).toBeInTheDocument()
    expect(screen.getByText(/Cuadernillo A:/)).toBeInTheDocument()
    expect(screen.getByText('Pendiente')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/cuadernillos/requests?limit=50', expect.anything())
    expect(screen.queryByRole('button', { name: /aprobar|rechazar|firmar/i })).not.toBeInTheDocument()
  })

  it('links each recipient to its ENOS school ficha using the dashed CUE form', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({
      campaignId: 'campaign-1', campaignOptions: [], requests: [summary], hasMore: false, nextCursor: null,
    })))

    render(<RequestList capability="supervisor" />)

    const link = await screen.findByRole('link', { name: /ver ficha en enos/i })
    expect(link).toHaveAttribute('href', '/mapas/infraestructura/escuelas/1801234-57')
  })

  it('formats the ficha href from a 9-digit CUE only', () => {
    expect(fichaEscuelaHref('180123457')).toBe('/mapas/infraestructura/escuelas/1801234-57')
    expect(fichaEscuelaHref('18012')).toBeNull()
  })

  it('requires an explicit campaign selection when the server reports multiple active campaigns', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({
      campaignId: null,
      campaignOptions: [
        { id: 'campaign-1', name: 'Distribución 2026', distributionEnabled: true, overassignmentAllowed: false },
        { id: 'campaign-2', name: 'Complementaria', distributionEnabled: false, overassignmentAllowed: null },
      ],
      requests: [], hasMore: false, nextCursor: null,
    })))

    render(<RequestList />)

    const selector = await screen.findByLabelText('Campaña de solicitudes')
    expect(selector).toHaveValue('')
    expect(screen.getByText('Elegí una campaña para consultar sus solicitudes.')).toBeInTheDocument()
    expect(screen.queryByText('Distribución 2026')).toBeInTheDocument()
  })

  it('rejects malformed request rows rather than rendering untrusted data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({
      campaignId: null, campaignOptions: [], requests: [{ recipientName: 'Unvalidated name', email: 'private@example.test' }],
      hasMore: false, nextCursor: null,
    })))

    render(<RequestList />)

    expect(await screen.findByRole('alert')).toHaveTextContent('La respuesta de solicitudes no tiene un formato válido.')
    expect(screen.queryByText('Unvalidated name')).not.toBeInTheDocument()
    expect(screen.queryByText('private@example.test')).not.toBeInTheDocument()
  })

  it('lets a supervisor review and individually attempt approval without client signer identity', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({
        campaignId: 'campaign-1', campaignOptions: [], requests: [summary], hasMore: false, nextCursor: null,
      }))
      .mockResolvedValueOnce(response({ error: 'authority_unavailable' }, false))
    vi.stubGlobal('fetch', fetchMock)

    render(<RequestList capability="supervisor" />)

    expect(await screen.findByText(/solicitado/i)).toBeInTheDocument()
    expect(screen.getByText(/La aprobación descuenta stock y cupo inmediatamente/i)).toBeInTheDocument()
    expect(screen.getByText(/no puede anularse/i)).toBeInTheDocument()
    const quantity = screen.getByLabelText('Cantidad aprobada · Cuadernillo A')
    expect(quantity).toHaveValue(12)
    const confirm = screen.getByLabelText(/Confirmo la decisión individual/i)
    expect(screen.getByRole('button', { name: 'Confirmar aprobación' })).toBeDisabled()
    fireEvent.click(confirm)
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar aprobación' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/no está disponible/i)
    expect(fetchMock).toHaveBeenLastCalledWith('/api/cuadernillos/requests/request-1/approve', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('"lines":[{"productId":"book-a","quantity":12}]'),
    }))
    const approvalBody = JSON.parse(fetchMock.mock.calls[1][1].body)
    expect(approvalBody).not.toHaveProperty('signerUserId')
    expect(approvalBody).not.toHaveProperty('approvedByUserId')
    expect(screen.queryByRole('button', { name: /aprobar todo/i })).not.toBeInTheDocument()
  })

  it('requires a reason for an individual rejection and reports a gated response without changing the view', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ campaignId: 'campaign-1', campaignOptions: [], requests: [summary], hasMore: false, nextCursor: null }))
      .mockResolvedValueOnce(response({ error: 'authority_unavailable' }, false))
    vi.stubGlobal('fetch', fetchMock)

    render(<RequestList capability="supervisor" />)

    expect(await screen.findByRole('button', { name: 'Rechazar solicitud' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Motivo del rechazo'), { target: { value: 'Solicitud duplicada' } })
    fireEvent.click(screen.getByRole('button', { name: 'Rechazar solicitud' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/no se modificó la solicitud/i)
    expect(fetchMock).toHaveBeenLastCalledWith('/api/cuadernillos/requests/request-1/reject', expect.objectContaining({
      method: 'POST', body: expect.stringContaining('"reason":"Solicitud duplicada"'),
    }))
    expect(screen.getByText('Pendiente')).toBeInTheDocument()
  })

  it('lets a cabecera propose only the server-reported available chain remainder and surfaces gated writes', async () => {
    const approved = {
      ...summary, status: 'approved' as const,
      approved: [{ productId: 'book-a', productLabel: 'Cuadernillo A', quantity: 8 }],
      remaining: [{ productId: 'book-a', productLabel: 'Cuadernillo A', quantity: 4 }],
      approvedAt: '2026-11-09T12:10:00.000Z', approvalIdentity: 'account-id-1',
    }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ campaignId: 'campaign-1', campaignOptions: [], requests: [approved], hasMore: false, nextCursor: null }))
      .mockResolvedValueOnce(response({
        rootRequestId: 'request-1',
        requested: [{ productId: 'book-a', quantity: 12 }],
        approved: [{ productId: 'book-a', quantity: 8 }],
        remaining: [{ productId: 'book-a', quantity: 4 }],
        availableRemainder: [{ productId: 'book-a', quantity: 2 }],
      }))
      .mockResolvedValueOnce(response({ error: 'authority_unavailable' }, false))
    vi.stubGlobal('fetch', fetchMock)

    render(<RequestList capability="cabecera" />)

    expect(await screen.findByText(/No aprobado en esta solicitud/i)).toBeInTheDocument()
    expect(screen.getByText('Cuadernillo A: 8')).toBeInTheDocument()
    expect(screen.getByText(/Cuenta que aprobó: account-id-1/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Consultar disponibilidad de remanente' }))
    expect(await screen.findByText('Disponible para proponer')).toBeInTheDocument()
    expect(screen.getByText('Cuadernillo A: 2')).toBeInTheDocument()
    expect(screen.getByLabelText('Cantidad propuesta · Cuadernillo A')).toHaveValue(2)
    fireEvent.click(screen.getByRole('button', { name: 'Solicitar remanente' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/no está disponible/i)
    expect(fetchMock).toHaveBeenLastCalledWith('/api/cuadernillos/requests/request-1/remainder', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('"lines":[{"productId":"book-a","quantity":2}]'),
    }))
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/cuadernillos/requests/request-1/remainder', expect.objectContaining({ cache: 'no-store' }))
  })
})
