// @vitest-environment jsdom
import * as React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { LEGACY_IFRAME_SANDBOX, LegacyViewer } from './legacy-viewer'

vi.mock('@/components/ui/button', () => ({
  Button: ({ render, children, ...props }: { render?: React.ReactElement; children: React.ReactNode }) =>
    render ? React.cloneElement(render, props, children) : React.createElement('button', props, children),
}))

describe('LegacyViewer', () => {
  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('uses an isolated sandbox and exposes the historical full-screen fallback', () => {
    render(<LegacyViewer src="/api/recursos/r2/archivo" fallbackHref="/tablero" title="Tablero nominal" />)
    expect(LEGACY_IFRAME_SANDBOX).toContain('allow-scripts')
    expect(LEGACY_IFRAME_SANDBOX).toContain('allow-forms')
    expect(LEGACY_IFRAME_SANDBOX).toContain('allow-downloads')
    expect(LEGACY_IFRAME_SANDBOX).not.toContain('allow-same-origin')
    expect(screen.getByTitle('Tablero nominal')).toHaveAttribute('src', '/api/recursos/r2/archivo')
    expect(screen.getByRole('link', { name: /abrir en pantalla completa/i })).toHaveAttribute('href', '/tablero')
  })

  it('reports loading and keeps the full-screen fallback available', () => {
    render(<LegacyViewer src="/api/recursos/r2/archivo" fallbackHref="/tablero" title="Tablero nominal" />)
    expect(screen.getByRole('status')).toHaveTextContent(/cargando visor/i)
    expect(screen.getAllByRole('link', { name: /abrir en pantalla completa/i })).toHaveLength(1)
  })

  it('marks a slow response as an error', async () => {
    vi.useFakeTimers()
    render(<LegacyViewer src="/api/recursos/r2/archivo" fallbackHref="/tablero" title="Tablero nominal" />)
    act(() => vi.advanceTimersByTime(15_000))
    expect(screen.getByRole('alert')).toHaveTextContent(/no se pudo cargar/i)
  })
})
