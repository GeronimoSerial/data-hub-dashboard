// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { useTendenciaEstacional } from './use-tendencia-estacional'

function Probe() {
  const { data, error } = useTendenciaEstacional('Capital', true)
  return <p>{error ?? (data ? 'con datos' : 'sin datos')}</p>
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('useTendenciaEstacional', () => {
  it('trata el 403 staff-only como ausencia esperada, sin error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }))
    render(<Probe />)
    await waitFor(() => expect(screen.getByText('sin datos')).toBeInTheDocument())
  })

  it('conserva el error para fallos distintos de autorización', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))
    render(<Probe />)
    await waitFor(() => expect(screen.getByText('No se pudo cargar la perspectiva estacional.')).toBeInTheDocument())
  })
})
