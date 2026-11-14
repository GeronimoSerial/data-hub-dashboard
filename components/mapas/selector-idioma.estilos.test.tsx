// @vitest-environment jsdom
import * as React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { SelectorIdioma } from './selector-idioma'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

describe('SelectorIdioma styling hooks', () => {
  afterEach(() => {
    cleanup()
  })

  it('applies the segmented-control style hooks and keeps the pressed state in sync', () => {
    const { rerender } = render(<SelectorIdioma idioma="es" idiomas={['pt', 'es']} />)

    const grupo = screen.getByTestId('selector-idioma')
    expect(grupo.className).toContain('idiomaSegmentado')
    expect(screen.getByRole('button', { name: 'Português' }).className).toContain('idiomaBoton')
    expect(screen.getByRole('button', { name: 'Español' }).className).toContain('idiomaBoton')
    expect(screen.getByRole('button', { name: 'Español' }).getAttribute('aria-pressed')).toBe('true')

    rerender(<SelectorIdioma idioma="pt" idiomas={['pt', 'es']} />)

    expect(screen.getByRole('button', { name: 'Português' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Español' }).getAttribute('aria-pressed')).toBe('false')
  })
})
