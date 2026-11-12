// @vitest-environment jsdom
import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { InfraestructuraLayoutShell } from './infraestructura-layout-shell'

vi.mock('next/navigation', () => ({
  usePathname: () => '/mapas/infraestructura/escuelas/1801605-00',
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock('./map-client', () => ({
  InfraestructuraMapClient: () => <div data-testid="mock-infraestructura-map-client" />,
}))

describe('InfraestructuraLayoutShell language selector', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    Reflect.deleteProperty(document, 'fullscreenElement')
  })

  it('renders no language selector when the region has one language', () => {
    render(
      <InfraestructuraLayoutShell
        mostrarEnlaceNominal={false}
        mostrarSelectorIdioma={false}
        idioma="es"
        idiomasRegion={['es']}
      >
        <div>Ficha</div>
      </InfraestructuraLayoutShell>,
    )

    expect(screen.queryByTestId('selector-idioma')).toBeNull()
  })

  it('renders the language selector when the region has more than one language', () => {
    render(
      <InfraestructuraLayoutShell
        mostrarEnlaceNominal={false}
        mostrarSelectorIdioma
        idioma="pt"
        idiomasRegion={['pt', 'es']}
      >
        <div>Ficha</div>
      </InfraestructuraLayoutShell>,
    )

    expect(screen.getByTestId('selector-idioma')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Português' }).getAttribute('aria-pressed')).toBe('true')
  })
})
