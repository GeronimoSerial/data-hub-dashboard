// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
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

function response(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

describe('OverviewPanel', () => {
  it('renders current global stock and head-specific remaining quota without inventing original quota', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(overview))
    vi.stubGlobal('fetch', fetchMock)

    render(<OverviewPanel capability="planning" />)

    expect(await screen.findByRole('row', { name: /Cuadernillo A.*10.*Cabecera.*4/ })).toBeInTheDocument()
    expect(screen.queryByText(/cupo originalmente asignado/i)).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/cuadernillos/overview?capability=planning', expect.anything())
  })

  it('keeps the stock and quota forms for planning', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(overview)))

    render(<OverviewPanel capability="planning" />)

    expect(await screen.findByRole('heading', { name: 'Registrar stock global' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Definir cupo disponible' })).toBeInTheDocument()
  })

  it('no longer renders the old cabecera request form; requests live in the cabecera view', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ ...overview, capability: 'cabecera' }))
    vi.stubGlobal('fetch', fetchMock)

    render(<OverviewPanel capability="cabecera" />)

    expect(await screen.findByRole('heading', { name: 'Catálogo y disponibilidad' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Escuela destinataria')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Guardar borrador' })).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith('/api/cuadernillos/recommendations'))).toBe(false)
  })
})
