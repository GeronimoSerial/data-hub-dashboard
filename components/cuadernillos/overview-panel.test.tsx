// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { OverviewPanel } from './overview-panel'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const campaign = { id: 'campaign-1', name: 'Distribución 2026', distributionEnabled: true, overassignmentAllowed: false }
const overview = {
  capability: 'planning' as const,
  campaignId: 'campaign-1', campaignOptions: [campaign],
  balances: [{ productId: 'book-a', productLabel: 'Cuadernillo A', globalAvailable: 10, quotaAssigned: null, quotaAvailable: 4, cabeceraCueAnexo: '180000000', cabeceraName: 'Cabecera' }],
  requests: [], eligibility: null, hasMore: false, nextCursor: null,
}
const assignments = {
  items: [
    { cueAnexo: '180000000', schoolName: 'Cabecera', relationship: 'cabecera' as const, cabeceraCueAnexo: '180000000', supervisorName: 'Supervisor' },
    { cueAnexo: '180000001', schoolName: 'Anexo', relationship: 'dependiente' as const, cabeceraCueAnexo: '180000000', supervisorName: 'Supervisor' },
  ],
  nextCursor: null,
}

function response(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

describe('OverviewPanel', () => {
  it('renders current global stock and head-specific remaining quota without inventing original quota', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(overview))
    vi.stubGlobal('fetch', fetchMock)

    render(<OverviewPanel capability="planning" assignments={null} onRequestCreated={() => undefined} />)

    expect(await screen.findByRole('row', { name: /Cuadernillo A.*10.*Cabecera.*4/ })).toBeInTheDocument()
    expect(screen.queryByText(/cupo originalmente asignado/i)).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/cuadernillos/overview?capability=planning', expect.anything())
  })

  it('creates an account-scoped request using only the selected recipient and mapped product', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.startsWith('/api/cuadernillos/recommendations')) {
        return Promise.resolve(response({ recommendations: [{ productId: 'book-a', students: 5, suggested: 5, sourceCutId: 'cut-1' }] }))
      }
      if (url === '/api/cuadernillos/requests' && init?.method === 'POST') {
        return Promise.resolve(response({ request: { requestId: 'req-1', status: 'draft' } }))
      }
      return Promise.resolve(response({
        ...overview, capability: 'cabecera',
        balances: [{ ...overview.balances[0], globalAvailable: null }],
      }))
    })
    vi.stubGlobal('fetch', fetchMock)
    const onRequestCreated = vi.fn()

    render(<OverviewPanel capability="cabecera" assignments={assignments} onRequestCreated={onRequestCreated} />)

    fireEvent.change(await screen.findByLabelText('Escuela destinataria'), { target: { value: '180000001' } })
    expect(await screen.findByText('Recomendación: 5 · matrícula: 5')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Cantidad para Cuadernillo A'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }))

    await waitFor(() => expect(onRequestCreated).toHaveBeenCalledOnce())
    const requestCall = fetchMock.mock.calls.find(([url, init]) => url === '/api/cuadernillos/requests' && init?.method === 'POST')
    expect(JSON.parse(requestCall?.[1]?.body as string)).toMatchObject({
      campaignId: 'campaign-1', recipientCueAnexo: '180000001', lines: [{ productId: 'book-a', quantity: 3 }], submit: false,
    })
    expect(JSON.stringify(JSON.parse(requestCall?.[1]?.body as string))).not.toMatch(/studentId|email|phone|dni/i)
  })

  it('keeps unavailable recommendations unknown instead of rendering them as zero', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => url.startsWith('/api/cuadernillos/recommendations')
      ? Promise.resolve(response({ recommendations: [{ productId: 'book-a', students: null, suggested: null, sourceCutId: null }] }))
      : Promise.resolve(response({ ...overview, capability: 'cabecera', balances: [{ ...overview.balances[0], globalAvailable: null }] }))))

    render(<OverviewPanel capability="cabecera" assignments={assignments} onRequestCreated={() => undefined} />)
    fireEvent.change(await screen.findByLabelText('Escuela destinataria'), { target: { value: '180000001' } })

    expect(await screen.findByText('Recomendación no disponible para el corte vigente.')).toBeInTheDocument()
    expect(screen.queryByText(/Recomendación: 0/)).not.toBeInTheDocument()
  })
})
