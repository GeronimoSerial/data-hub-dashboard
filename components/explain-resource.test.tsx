// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ExplainResource } from './explain-resource'

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('ExplainResource UI', () => {
  it('surfaces the safe unavailable state when AI is not configured', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      jsonResponse(
        {
          error: {
            code: 'ai_unavailable',
            message: 'El resumen con IA no está configurado en este despliegue.',
          },
        },
        503,
      ),
    ))
    render(<ExplainResource resourceId="r1" />)
    fireEvent.click(screen.getByRole('button', { name: /explícame este recurso/i }))
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/no está configurado/i)
    })
    // It never renders a fabricated explanation.
    expect(screen.queryByText('Te puede servir para')).not.toBeInTheDocument()
  })

  it('renders a validated explanation on success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      jsonResponse(
        {
          explanation: {
            summary: 'Resumen confiable.',
            usefulFor: ['Consultar matrícula.'],
            firstLook: null,
          },
          cached: true,
        },
        200,
      ),
    ))
    render(<ExplainResource resourceId="r1" />)
    fireEvent.click(screen.getByRole('button', { name: /explícame este recurso/i }))
    await waitFor(() => {
      expect(screen.getByText('Resumen confiable.')).toBeInTheDocument()
    })
    expect(screen.getByText('Te puede servir para')).toBeInTheDocument()
  })

  it('shows a generic recoverable error and the resource remains usable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({}, 500)))
    render(<ExplainResource resourceId="r1" />)
    fireEvent.click(screen.getByRole('button', { name: /explícame este recurso/i }))
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/no se pudo generar/i)
    })
  })

  it('renders the explicit insufficient-context state, not a success result', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      jsonResponse(
        {
          status: 'insufficient-context',
          cached: false,
          explanation: {
            summary: 'No hay suficiente contexto publicado para generar una explicación confiable.',
            usefulFor: [],
            firstLook: null,
          },
        },
        200,
      ),
    ))
    render(<ExplainResource resourceId="r1" />)
    fireEvent.click(screen.getByRole('button', { name: /explícame este recurso/i }))
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/no hay suficiente contexto/i)
    })
    // The refusal must never be presented as a model-generated success result.
    expect(screen.queryByText('Te puede servir para')).not.toBeInTheDocument()
    expect(screen.queryByText('Qué mirar primero')).not.toBeInTheDocument()
  })

  it('treats a missing status/explanation as an error, never faking success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ cached: true }, 200)))
    render(<ExplainResource resourceId="r1" />)
    fireEvent.click(screen.getByRole('button', { name: /explícame este recurso/i }))
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/no se pudo generar/i)
    })
  })
})