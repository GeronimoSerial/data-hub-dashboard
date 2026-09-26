// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EpisodioCrearForm } from './episodio-crear-form'

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshMock }) }))

const fetchMock = vi.fn()

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const PERIODO = 'periodo-enos-2026-2027'

beforeEach(() => {
  refreshMock.mockReset()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  cleanup()
  document.body.innerHTML = ''
})

describe('EpisodioCrearForm', () => {
  it('envía con nombre válido, manda el body correcto y refresca al tener éxito', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, episodio: { id: 'e1' } }, 201))

    render(<EpisodioCrearForm periodoId={PERIODO} />)
    fireEvent.change(screen.getByLabelText(/nombre/i), {
      target: { value: 'Episodio Norte' },
    })
    fireEvent.click(screen.getByRole('button', { name: /crear episodio/i }))

    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1))
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/infraestructura/episodios',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ periodoId: PERIODO, nombre: 'Episodio Norte' }),
      }),
    )
  })

  it('sin nombre el botón está deshabilitado', () => {
    render(<EpisodioCrearForm periodoId={PERIODO} />)
    expect(screen.getByRole('button', { name: /crear episodio/i })).toBeDisabled()
  })

  it('muestra el error del servidor con role alert', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'Nombre requerido' }, 400))

    render(<EpisodioCrearForm periodoId={PERIODO} />)
    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: 'X' } })
    fireEvent.click(screen.getByRole('button', { name: /crear episodio/i }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Nombre requerido'),
    )
    expect(refreshMock).not.toHaveBeenCalled()
  })
})
