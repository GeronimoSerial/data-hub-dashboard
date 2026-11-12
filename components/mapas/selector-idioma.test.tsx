// @vitest-environment jsdom
import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SelectorIdioma } from './selector-idioma'

const refresh = vi.hoisted(() => vi.fn())

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}))

describe('SelectorIdioma', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    refresh.mockReset()
    fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ idioma: 'pt' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('lists the region languages with their own names', () => {
    render(<SelectorIdioma idioma="es" idiomas={['pt', 'es']} />)

    expect(screen.getByTestId('selector-idioma')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Español' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Português' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('saves the chosen language with PATCH and refreshes the route', async () => {
    render(<SelectorIdioma idioma="es" idiomas={['pt', 'es']} />)

    fireEvent.click(screen.getByRole('button', { name: 'Português' }))

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/usuario/idioma',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ idioma: 'pt' }),
      }),
    )
  })

  it('does not call the server when the current language is clicked', () => {
    render(<SelectorIdioma idioma="es" idiomas={['pt', 'es']} />)

    fireEvent.click(screen.getByRole('button', { name: 'Español' }))

    expect(fetchMock).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })
})
