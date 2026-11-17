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
  it('opens with the task card, compact numbers and no approve or reject actions', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(page([remito]))))

    render(<ControlView />)

    const task = await screen.findByLabelText('Lo que tenés que hacer')
    expect(task).toHaveTextContent('1 envío llegó incompleto. Revisalos.')
    const kpis = screen.getByLabelText('Resumen de envíos')
    expect(kpis).toHaveTextContent(/Esperando a la cabecera\s*2/)
    expect(kpis).toHaveTextContent(/Esperando a la escuela\s*3/)
    expect(kpis).toHaveTextContent(/Llegó de menos a la cabecera\s*5/)
    expect(kpis).toHaveTextContent(/Llegó de menos a la escuela\s*2/)
    expect(screen.getByRole('button', { name: /Envío a Cabecera Norte/ })).toHaveTextContent('Llegó de menos')
    expect(screen.queryByRole('button', { name: /aprobar|rechazar/i })).not.toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/remito|tramo|línea|faltantes/i)
  })

  it('pluralises the task card and says nothing is pending when no envío is incomplete', async () => {
    const second = { ...remito, remitoId: 'remito-2' }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(page([remito, second]))))
    const { unmount } = render(<ControlView />)
    expect(await screen.findByLabelText('Lo que tenés que hacer')).toHaveTextContent('2 envíos llegaron incompletos. Revisalos.')
    unmount()

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(page([{ ...remito, hasShortfall: false }]))))
    render(<ControlView />)
    expect(await screen.findByLabelText('Lo que tenés que hacer')).toHaveTextContent('No tenés nada pendiente.')
    expect(screen.queryByRole('button', { name: 'Ver los incompletos' })).not.toBeInTheDocument()
  })

  it('asks the server for incomplete envíos only when the task card action is used', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(page([remito])))
    vi.stubGlobal('fetch', fetchMock)

    render(<ControlView />)
    await screen.findByLabelText('Resumen de envíos')
    expect(fetchMock).toHaveBeenLastCalledWith('/api/cuadernillos/control', expect.anything())
    fireEvent.click(screen.getByRole('button', { name: 'Ver los incompletos' }))

    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith('/api/cuadernillos/control?onlyWithShortfall=true', expect.anything()))
    expect(await screen.findByRole('button', { name: 'Ver todos los envíos' })).toBeInTheDocument()
  })

  it('keeps observations out of the list until an envío is opened', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(page([{
      ...remito,
      observations: [{ id: 'obs-0', lineId: null, authorUserId: 'sup', authorName: 'Super Visor', body: 'Ya hablé con la cabecera', createdAt: '2026-11-13T12:00:00.000Z' }],
    }]))))

    render(<ControlView />)
    const row = await screen.findByRole('button', { name: /Envío a Cabecera Norte/ })
    expect(row).toHaveTextContent('1 observación')
    expect(screen.queryByText('Ya hablé con la cabecera')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Agregar observación')).not.toBeInTheDocument()

    fireEvent.click(row)
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Ya hablé con la cabecera')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Agregar observación')).toBeInTheDocument()
  })

  it('shows the journey with who and when, quantities per product and the reasons', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(page([remito]))))

    render(<ControlView />)
    fireEvent.click(await screen.findByRole('button', { name: /Envío a Cabecera Norte/ }))

    const dialog = await screen.findByRole('dialog')
    const journey = within(dialog).getByRole('list', { name: 'Recorrido del envío' })
    const steps = within(journey).getAllByRole('listitem')
    expect(steps.map((step) => step.getAttribute('data-state'))).toEqual(['done', 'short', 'current'])
    expect(steps[0]).toHaveTextContent('Plani Pérez')
    expect(steps[1]).toHaveTextContent('Cabe Gómez')
    expect(steps[1]).toHaveTextContent('llegó de menos')
    expect(steps[2]).toHaveTextContent('1 de 2 escuelas')

    const lineA = within(dialog).getByRole('region', { name: 'Escuela A' })
    expect(lineA).toHaveTextContent('Llegó a la escuela · Director A')
    const row = within(lineA).getByRole('row', { name: /1\.er grado/ })
    expect(within(row).getAllByRole('cell').map((c) => c.textContent)).toEqual(['30', '25 (faltan 5)', '23 (faltan 2)'])
    expect(lineA).toHaveTextContent('Por qué llegó de menos a la cabecera: Cajas dañadas')
    expect(lineA).toHaveTextContent('Por qué llegó de menos a la escuela: Faltaron 2 en la entrega')
    expect(within(dialog).getByRole('region', { name: 'Escuela B' })).toHaveTextContent('Esperando a la escuela')
  })

  it('marks the journey as arrived when every school confirmed with nothing short', async () => {
    const done = {
      ...remito, hasShortfall: false,
      lines: [{ ...remito.lines[0], cabeceraShortfallReason: null, schoolShortfallReason: null, items: [item({ schoolReceived: 30, planningToCabeceraShortfall: null, cabeceraReceived: 30 })] }],
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(page([done]))))

    render(<ControlView />)
    fireEvent.click(await screen.findByRole('button', { name: /Envío a Cabecera Norte/ }))
    const dialog = await screen.findByRole('dialog')
    const steps = within(within(dialog).getByRole('list', { name: 'Recorrido del envío' })).getAllByRole('listitem')
    expect(steps.map((step) => step.getAttribute('data-state'))).toEqual(['done', 'done', 'done'])
  })

  it('posts an observation for a school and shows it in the list', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return Promise.resolve(response({ observation: { id: 'obs-1', lineId: 'line-b', authorUserId: 'sup', authorName: 'Super Visor', body: 'Revisar el traslado', createdAt: '2026-11-13T12:00:00.000Z' } }, 201))
      }
      return Promise.resolve(response(page([remito])))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<ControlView />)
    fireEvent.click(await screen.findByRole('button', { name: /Envío a Cabecera Norte/ }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Agregar observación'), { target: { value: 'Revisar el traslado' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Escuela B' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar observación' }))

    const list = await within(dialog).findByRole('list', { name: 'Observaciones del envío' })
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
    fireEvent.click(await screen.findByRole('button', { name: /Envío a Cabecera Norte/ }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Agregar observación'), { target: { value: 'Hola' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar observación' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Esta cuenta no puede dejar observaciones en este envío.')
  })

  it('shows the empty state with the circuit guide, and a load error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(page([]))))
    const { unmount } = render(<ControlView />)
    expect(await screen.findByText('Todavía no hay envíos para revisar')).toBeInTheDocument()
    expect(screen.getByLabelText('Cómo funciona')).toBeInTheDocument()
    expect(screen.getByLabelText('Lo que tenés que hacer')).toHaveTextContent('No tenés nada pendiente.')
    unmount()

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ error: 'forbidden' }, 403)))
    render(<ControlView />)
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron cargar los envíos.')
  })

  it('names a directo envío without cabecera instead of a null cabecera', async () => {
    const direct = { ...remito, remitoId: 'remito-direct', modo: 'directo', cabeceraCueAnexo: null, cabeceraName: null, cabeceraReceivedByUserId: null, cabeceraReceivedByName: null, cabeceraReceivedAt: null, hasShortfall: false }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(page([direct]))))

    render(<ControlView />)

    expect(await screen.findByRole('button', { name: /Envío directo/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Envío directo/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Envío directo')).toBeInTheDocument()
  })
})
