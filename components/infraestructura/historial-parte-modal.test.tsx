// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { HistorialParteModal } from './historial-parte-modal'

const CUE = '1801605-04'

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('HistorialParteModal', () => {
  it('no fetchea nada mientras cueAnexo es null', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    render(<HistorialParteModal cueAnexo={null} onOpenChange={() => {}} />)

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('usa la ruta del mapa, no la del director, y apaga el reingreso por cookie en un 401', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)

    render(<HistorialParteModal cueAnexo={CUE} onOpenChange={() => {}} />)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(fetchMock.mock.calls[0][0]).toBe(
      `/api/mapas/infraestructura/historial?cue=${CUE}`,
    )

    // Sin mostrarReingresoCookie, un 401 en el mapa no ofrece el enlace de
    // "Volver a ingresar la contraseña" (no aplica: es sesión de hub, no cookie).
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos mostrar el historial.',
    )
    expect(
      screen.queryByRole('link', { name: 'Volver a ingresar la contraseña' }),
    ).not.toBeInTheDocument()
  })

  it('muestra los movimientos devueltos por la ruta del mapa', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          movimientos: [
            {
              id: 'm1',
              tipo: 'actualizacion',
              rol: 'director',
              creadaEn: '2026-08-01T12:00:00Z',
              rigeDesde: '2026-08-01T12:00:00Z',
              titulo: 'Cambió el funcionamiento de las clases',
              cambios: ['Funcionamiento: habitual → interrumpido'],
            },
          ],
        }),
      }),
    )

    render(<HistorialParteModal cueAnexo={CUE} onOpenChange={() => {}} />)

    expect(await screen.findByText('Funcionamiento: habitual → interrumpido')).toBeInTheDocument()
  })
})
