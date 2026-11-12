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

describe('InfraestructuraLayoutShell language strip', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('wraps the selector in the right-aligned strip only when it renders', () => {
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

    const grupo = screen.getByTestId('selector-idioma')
    expect(grupo.parentElement?.className).toContain('idiomaBarra')
  })

  it('renders no strip wrapper when the selector is hidden', () => {
    render(
      <InfraestructuraLayoutShell mostrarEnlaceNominal={false} mostrarSelectorIdioma={false} idioma="es">
        <div>Ficha</div>
      </InfraestructuraLayoutShell>,
    )

    expect(screen.queryByTestId('selector-idioma')).toBeNull()
    expect(document.querySelector('[class*="idiomaBarra"]')).toBeNull()
  })
})
