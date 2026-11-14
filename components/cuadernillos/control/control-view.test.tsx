// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ControlView } from './control-view'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function response(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

const item = (over: Record<string, unknown> = {}) => ({
  productId: 'book-1', productLabel: 'Cuadernillo 1.er grado', dispatched: 30, cabeceraReceived: 25, schoolReceived: null,
  planningToCabeceraShortfall: 5, cabeceraToSchoolShortfall: null, ...over,
})

const remito = {
  remitoId: 'remito-1', campaignId: 'campaign-1', cabeceraCueAnexo: '180000000', cabeceraName: 'Cabecera Norte', status: 'dispatched',
  dispatchedByUserId: 'u1', dispatchedByName: 'Plani Pérez', dispatchedAt: '2026-11-10T12:00:00.000Z',
  cabeceraReceivedByUserId: 'u2', cabeceraReceivedByName: 'Cabe Gómez', cabeceraReceivedAt: '2026-11-11T12:00:00.000Z',
  hasShortfall: true,
  observations: [],
  lines: [
    {
      lineId: 'line-a', recipientCueAnexo: '180123457', recipientName: 'Escuela A', status: 'received',
      schoolReceivedByUserId: 'u3', schoolReceivedByName: 'Director A', schoolReceivedAt: '2026-11-12T12:00:00.000Z',
      cabeceraShortfallReason: 'Cajas dañadas', schoolShortfallReason: 'Faltaron 2 en la entrega',
      items: [item({ schoolReceived: 23, cabeceraToSchoolShortfall: 2 })],
    },
    {
      lineId: 'line-b', recipientCueAnexo: '180123458', recipientName: 'Escuela B', status: 'at_cabecera',
      schoolReceivedByUserId: null, schoolReceivedByName: null, schoolReceivedAt: null,
      cabeceraShortfallReason: null, schoolShortfallReason: null, items: [item({ dispatched: 10, cabeceraReceived: 10, planningToCabeceraShortfall: 0 })],
    },
  ],
}

const page = (remitos: unknown[]) => ({
  summary: { remitosPendingCabeceraReceipt: 2, linesPendingSchoolReceipt: 3, planningToCabeceraShortfallUnits: 5, cabeceraToSchoolShortfallUnits: 2 },
  remitos, hasMore: false, nextCursor: null,
})

describe('ControlView', () => {
  it('renders the KPIs and the remito list, with no approve or reject actions', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(page([remito]))))

    render(<ControlView />)

    const kpis = await screen.findByLabelText('Resumen de control')
    expect(kpis).toHaveTextContent(/Remitos pendientes de recepción en cabecera\s*2/)
    expect(kpis).toHaveTextContent(/Líneas pendientes en escuela\s*3/)
    expect(kpis).toHaveTextContent(/Faltantes Planeamiento → Cabecera\s*5/)
    expect(kpis).toHaveTextContent(/Faltantes Cabecera → Escuela\s*2/)
    expect(screen.getByRole('button', { name: /Remito a Cabecera Norte/ })).toHaveTextContent('Con faltantes')
    expect(screen.queryByRole('button', { name: /aprobar|rechazar/i })).not.toBeInTheDocument()
  })

  it('asks the server for remitos with shortfall only when filtered', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(page([remito])))
    vi.stubGlobal('fetch', fetchMock)

    render(<ControlView />)
    await screen.findByLabelText('Resumen de control')
    expect(fetchMock).toHaveBeenLastCalledWith('/api/cuadernillos/control', expect.anything())
    fireEvent.click(screen.getByRole('button', { name: 'Solo con faltantes' }))

    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith('/api/cuadernillos/control?onlyWithShortfall=true', expect.anything()))
  })

  it('shows the chain with who signed, quantities and shortfall per leg with its reason', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(page([remito]))))

    render(<ControlView />)
    fireEvent.click(await screen.findByRole('button', { name: /Remito a Cabecera Norte/ }))

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Despachó Plani Pérez')
    expect(dialog).toHaveTextContent('Firmó Cabe Gómez')
    const lineA = within(dialog).getByRole('region', { name: 'Escuela A' })
    expect(lineA).toHaveTextContent('Firmó Director A')
    expect(lineA).toHaveTextContent('Despachado 30 · Cabecera 25 · Escuela 23')
    expect(lineA).toHaveTextContent('Planeamiento → Cabecera: faltan 5')
    expect(lineA).toHaveTextContent('Cabecera → Escuela: faltan 2')
    expect(lineA).toHaveTextContent('Motivo del faltante en cabecera: Cajas dañadas')
    expect(lineA).toHaveTextContent('Motivo del faltante en escuela: Faltaron 2 en la entrega')
    expect(within(dialog).getByRole('region', { name: 'Escuela B' })).toHaveTextContent('Escuela: pendiente de firma')
  })

  it('posts an observation for a line and shows it in the list', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return Promise.resolve(response({ observation: { id: 'obs-1', lineId: 'line-b', authorUserId: 'sup', authorName: 'Super Visor', body: 'Revisar el traslado', createdAt: '2026-11-13T12:00:00.000Z' } }, 201))
      }
      return Promise.resolve(response(page([remito])))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<ControlView />)
    fireEvent.click(await screen.findByRole('button', { name: /Remito a Cabecera Norte/ }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Agregar observación'), { target: { value: 'Revisar el traslado' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Escuela B' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar observación' }))

    const list = await within(dialog).findByRole('list', { name: 'Observaciones del remito' })
    expect(list).toHaveTextContent('Revisar el traslado')
    expect(list).toHaveTextContent('Super Visor')
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!
    expect(post[0]).toBe('/api/cuadernillos/remitos/remito-1/observaciones')
    expect(JSON.parse(String(post[1].body))).toEqual({ lineId: 'line-b', body: 'Revisar el traslado' })
  })

  it('shows a meaningful message when the observation is refused', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url: string, init?: RequestInit) =>
      Promise.resolve(init?.method === 'POST' ? response({ error: 'forbidden' }, 403) : response(page([remito])))))

    render(<ControlView />)
    fireEvent.click(await screen.findByRole('button', { name: /Remito a Cabecera Norte/ }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Agregar observación'), { target: { value: 'Hola' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar observación' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Esta cuenta no puede agregar observaciones a este remito.')
  })

  it('shows an empty state and a load error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(page([]))))
    const { unmount } = render(<ControlView />)
    expect(await screen.findByText('Todavía no hay remitos para controlar')).toBeInTheDocument()
    unmount()

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ error: 'forbidden' }, 403)))
    render(<ControlView />)
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar el control de remitos.')
  })
})
