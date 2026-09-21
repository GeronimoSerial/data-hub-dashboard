// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HistorialParte } from './historial-parte'
import type { MovimientoHistorial } from './historial-movimiento'

const CUE = '180001000'

function iso(anio: number, mes: number, dia: number, hora: number, minuto: number): string {
  return new Date(anio, mes - 1, dia, hora, minuto, 0, 0).toISOString()
}

function movimiento(id: string, dia: number, hora: number, cambios: string[]): MovimientoHistorial {
  const carga = iso(2026, 9, dia, hora, 0)
  return { id, tipo: 'actualizacion', rol: 'director', creadaEn: carga, rigeDesde: carga, cambios }
}

function responderCon(movimientos: MovimientoHistorial[]) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ ok: true, movimientos }),
  })
}

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('HistorialParte', () => {
  it('pide el historial del CUE recibido', async () => {
    const fetchMock = responderCon([])
    vi.stubGlobal('fetch', fetchMock)

    render(<HistorialParte cue={CUE} />)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/problematicas/parte/historial?cue=${CUE}`)
  })

  it('conserva el orden cronológico inverso que devuelve la ruta', async () => {
    vi.stubGlobal(
      'fetch',
      responderCon([
        movimiento('mov-3', 18, 10, ['Clases normales → Clases suspendidas en 2.º A']),
        movimiento('mov-2', 17, 16, ['Se inició el reporte por "Inundación"']),
        movimiento('mov-1', 16, 8, ['12 alumnos incorporados']),
      ]),
    )

    const { container } = render(<HistorialParte cue={CUE} />)

    await screen.findByText('12 alumnos incorporados')
    const cargas = Array.from(container.querySelectorAll('.historial-movimiento__carga')).map(
      (el) => el.textContent,
    )
    expect(cargas).toEqual(['18 sep · 10:00', '17 sep · 16:00', '16 sep · 08:00'])
  })

  it('muestra el estado vacío, y no un error, cuando no hay movimientos', async () => {
    vi.stubGlobal('fetch', responderCon([]))

    render(<HistorialParte cue={CUE} />)

    expect(
      await screen.findByText(
        'No hay una situación hidrometeorológica en seguimiento para este establecimiento.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Iniciar un reporte' })).toHaveAttribute(
      'href',
      `/problematicas/parte/nuevo?cue=${CUE}`,
    )
  })

  it('avisa del estado de espera mientras la ruta responde', async () => {
    let resolver: (valor: unknown) => void = () => {}
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(new Promise((resolve) => {
        resolver = resolve
      })),
    )

    render(<HistorialParte cue={CUE} />)

    expect(screen.getByRole('status')).toHaveTextContent('Buscando los movimientos del parte…')

    resolver({ ok: true, json: async () => ({ ok: true, movimientos: [] }) })
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
  })

  it('ofrece reintentar cuando la red falla, y se recupera al reintentar', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('sin red'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, movimientos: [movimiento('mov-1', 18, 10, ['12 alumnos incorporados'])] }),
      })
    vi.stubGlobal('fetch', fetchMock)

    render(<HistorialParte cue={CUE} />)

    const aviso = await screen.findByRole('alert')
    expect(aviso).toHaveTextContent('No pudimos mostrar el historial.')

    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByText('12 alumnos incorporados')).toBeInTheDocument()
  })

  it('trata una respuesta HTTP fallida como error de lectura, no como historial vacío', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }))

    render(<HistorialParte cue={CUE} />)

    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })
})
