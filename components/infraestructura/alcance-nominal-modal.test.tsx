// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { AlcanceNominalModal } from './alcance-nominal-modal'

function respuesta() {
  return {
    ok: true,
    cantidad: 2,
    secciones: [
      {
        geSectionId: 1,
        curso: '2°',
        division: 'A',
        turno: 'Mañana',
        alumnos: [
          { nombre: 'Ana', apellido: 'Gómez' },
          { nombre: 'Luis', apellido: 'Pérez' },
        ],
      },
    ],
  }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('AlcanceNominalModal', () => {
  it('no hace ningún fetch mientras afectacionId es null', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    render(<AlcanceNominalModal afectacionId={null} onOpenChange={() => {}} />)

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('hace exactamente un fetch al pasar a un id, y no repite en un rerender con las mismas props', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => respuesta() })
    vi.stubGlobal('fetch', fetchMock)

    const { rerender } = render(
      <AlcanceNominalModal afectacionId="a1" onOpenChange={() => {}} />,
    )

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(fetchMock.mock.calls[0][0]).toBe('/api/mapas/infraestructura/nominal?afectacionId=a1')

    rerender(<AlcanceNominalModal afectacionId="a1" onOpenChange={() => {}} />)
    // Mismas props: ningún fetch adicional.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('muestra secciones y alumnos alcanzados una vez que responde', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => respuesta() }),
    )

    render(<AlcanceNominalModal afectacionId="a1" onOpenChange={() => {}} />)

    expect(await screen.findByText('2 alumnos alcanzados.')).toBeInTheDocument()
    expect(screen.getByText('Gómez, Ana')).toBeInTheDocument()
    expect(screen.getByText('Pérez, Luis')).toBeInTheDocument()
    expect(screen.getByText(/2° A · Mañana/)).toBeInTheDocument()
  })

  it('remonta y vuelve a fetchear al reabrir con otra afectación (key distinta)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => respuesta() })
    vi.stubGlobal('fetch', fetchMock)

    const { rerender } = render(
      <AlcanceNominalModal afectacionId="a1" onOpenChange={() => {}} />,
    )
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    rerender(<AlcanceNominalModal afectacionId="a2" onOpenChange={() => {}} />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(fetchMock.mock.calls[1][0]).toBe('/api/mapas/infraestructura/nominal?afectacionId=a2')
  })
})
