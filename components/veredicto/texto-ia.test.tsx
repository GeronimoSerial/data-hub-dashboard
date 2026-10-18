// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, renderHook, screen } from '@testing-library/react'
import { contarPalabras, pasoEscritura, TextoIA, useEscribiendo } from './texto-ia'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function stubMovimientoReducido(reducido: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: reducido && query.includes('reduce'), media: query }))
}

describe('TextoIA', () => {
  it('exposes the full text to screen readers and hides the animated copy', () => {
    const { container } = render(<TextoIA texto="Río Paraná en alerta hoy." />)
    expect(screen.getByText('Río Paraná en alerta hoy.')).toHaveClass('sr-only')
    const animado = container.querySelector('[aria-hidden="true"]')
    expect(animado?.textContent).toBe('Río Paraná en alerta hoy.')
  })

  it('staggers each word from the given start offset', () => {
    const { container } = render(<TextoIA texto="uno dos tres" inicio={4} paso={20} />)
    const palabras = [...container.querySelectorAll<HTMLElement>('.texto-ia__palabra')]
    expect(palabras.map((p) => p.style.animationDelay)).toEqual(['80ms', '100ms', '120ms'])
  })
})

describe('typing helpers', () => {
  it('counts words ignoring extra whitespace', () => {
    expect(contarPalabras(['  dos palabras ', 'y tres más'])).toBe(5)
  })

  it('keeps the whole text within the typing budget and caps the per-word step', () => {
    expect(pasoEscritura(10)).toBe(35)
    expect(pasoEscritura(120) * 120).toBeLessThanOrEqual(1200)
  })

  it('reports typing until the duration ends', () => {
    stubMovimientoReducido(false)
    vi.useFakeTimers()
    const { result } = renderHook(() => useEscribiendo(500))
    expect(result.current).toBe(true)
    act(() => {
      vi.advanceTimersByTime(600)
    })
    expect(result.current).toBe(false)
  })

  it('never reports typing when the user prefers reduced motion', () => {
    stubMovimientoReducido(true)
    const { result } = renderHook(() => useEscribiendo(500))
    expect(result.current).toBe(false)
  })
})
