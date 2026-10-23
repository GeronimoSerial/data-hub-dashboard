// @vitest-environment jsdom
import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { InfraestructuraLayoutShell } from './infraestructura-layout-shell'

const mockPathname = vi.fn<() => string>()
const montajesMapa = vi.hoisted(() => ({ count: 0 }))

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
}))

vi.mock('./map-client', () => ({
  InfraestructuraMapClient: (props: { rutaActiva?: boolean }) => {
    React.useEffect(() => {
      montajesMapa.count += 1
    }, [])
    return (
      <div
        data-testid="mock-infraestructura-map-client"
        data-ruta-activa={String(Boolean(props.rutaActiva))}
      />
    )
  },
}))

describe('InfraestructuraLayoutShell', () => {
  beforeEach(() => {
    montajesMapa.count = 0
    mockPathname.mockReset()
  })

  afterEach(() => {
    cleanup()
    Reflect.deleteProperty(document, 'fullscreenElement')
  })

  it('no monta el mapa en entrada directa a /mapas/infraestructura/escuelas/[cue] hasta visitar el mapa', () => {
    mockPathname.mockReturnValue('/mapas/infraestructura/escuelas/1801605-00')

    const { rerender } = render(
      <InfraestructuraLayoutShell mostrarEnlaceNominal={false}>
        <div data-testid="ficha-child">Ficha</div>
      </InfraestructuraLayoutShell>,
    )

    expect(screen.getByTestId('ficha-child')).toBeDefined()
    expect(screen.queryByTestId('mock-infraestructura-map-client')).toBeNull()
    expect(montajesMapa.count).toBe(0)

    mockPathname.mockReturnValue('/mapas/infraestructura')
    rerender(
      <InfraestructuraLayoutShell mostrarEnlaceNominal={false}>
        <div data-testid="ficha-child">Ficha</div>
      </InfraestructuraLayoutShell>,
    )

    expect(screen.getByTestId('mock-infraestructura-map-client')).toBeDefined()
    expect(montajesMapa.count).toBe(1)
  })

  it('preserva la instancia montada del mapa con hidden al navegar hacia la ficha y volver', () => {
    mockPathname.mockReturnValue('/mapas/infraestructura')

    const { rerender } = render(
      <InfraestructuraLayoutShell mostrarEnlaceNominal={true}>
        <div data-testid="ficha-child">Ficha</div>
      </InfraestructuraLayoutShell>,
    )

    expect(montajesMapa.count).toBe(1)
    expect(screen.getByTestId('contenedor-mapa-persistente').hasAttribute('hidden')).toBe(false)

    // Navegar a /mapas/infraestructura/escuelas/1801605-00
    mockPathname.mockReturnValue('/mapas/infraestructura/escuelas/1801605-00')
    rerender(
      <InfraestructuraLayoutShell mostrarEnlaceNominal={true}>
        <div data-testid="ficha-child">Ficha</div>
      </InfraestructuraLayoutShell>,
    )

    expect(montajesMapa.count).toBe(1)
    expect(screen.getByTestId('contenedor-mapa-persistente').hasAttribute('hidden')).toBe(true)
    expect(screen.getByTestId('ficha-child')).toBeDefined()

    // Volver a /mapas/infraestructura
    mockPathname.mockReturnValue('/mapas/infraestructura')
    rerender(
      <InfraestructuraLayoutShell mostrarEnlaceNominal={true}>
        <div data-testid="ficha-child">Ficha</div>
      </InfraestructuraLayoutShell>,
    )

    expect(montajesMapa.count).toBe(1)
    expect(screen.getByTestId('contenedor-mapa-persistente').hasAttribute('hidden')).toBe(false)
  })

  it('mantiene la ficha y el mapa dentro de la misma raíz fullscreen al navegar y volver', () => {
    mockPathname.mockReturnValue('/mapas/infraestructura')
    const exitFullscreen = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exitFullscreen })
    const vista = (
      <InfraestructuraLayoutShell mostrarEnlaceNominal={true}>
        <div data-testid="ficha-child"><button>Situaciones</button></div>
      </InfraestructuraLayoutShell>
    )
    const { rerender } = render(vista)
    const raiz = screen.getByTestId('infraestructura-pantalla-completa')
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: raiz })
    fireEvent(document, new Event('fullscreenchange'))

    mockPathname.mockReturnValue('/mapas/infraestructura/escuelas/1801605-00')
    rerender(<InfraestructuraLayoutShell mostrarEnlaceNominal={true}>
      <div data-testid="ficha-child"><button>Situaciones</button></div>
    </InfraestructuraLayoutShell>)

    expect(document.fullscreenElement).toBe(raiz)
    expect(raiz.closest('[hidden]')).toBeNull()
    expect(raiz).toContainElement(screen.getByTestId('ficha-child'))
    expect(screen.getByRole('button', { name: 'Situaciones' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Salir de pantalla completa' }))
    expect(exitFullscreen).toHaveBeenCalledOnce()

    mockPathname.mockReturnValue('/mapas/infraestructura')
    rerender(<InfraestructuraLayoutShell mostrarEnlaceNominal={true}><div>Ficha</div></InfraestructuraLayoutShell>)
    expect(raiz).toContainElement(screen.getByTestId('mock-infraestructura-map-client'))
    expect(montajesMapa.count).toBe(1)
    expect(screen.queryByRole('button', { name: 'Salir de pantalla completa' })).toBeNull()
    Reflect.deleteProperty(document, 'exitFullscreen')
  })
})
