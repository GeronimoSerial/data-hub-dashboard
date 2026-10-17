// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { RespuestaRadarMeteo } from '@/lib/infraestructura/radar-meteo/use-radar-meteo'
import fixtureJson from './radar-meteo-real-reducido.fixture.json'

const fixture = fixtureJson as RespuestaRadarMeteo

vi.mock('@/lib/infraestructura/radar-meteo/use-radar-meteo', () => ({
  useRadarMeteo: () => ({ data: fixture, loading: false, error: null }),
}))

vi.mock('react-map-gl/maplibre', async () => {
  const React = await import('react')
  return {
    Layer: () => null,
    Marker: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    Source: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  }
})

import { RadarMeteo } from './radar-meteo'

const celda = fixture.grid!.celdas[0]
const ESCUELA = { cueAnexo: '180000100', nombre: 'Escuela Rural', lat: celda.lat, lon: celda.lon }

function crearMapa() {
  return {
    getZoom: () => 10,
    getLayer: () => undefined,
    getSource: () => undefined,
    getBounds: () => ({ contains: () => true }),
    triggerRepaint: () => undefined,
    on: () => undefined,
    off: () => undefined,
  }
}

function montar() {
  render(<RadarMeteo activo variable="lluvia" escuelas={[ESCUELA] as never} resumen={null} alertasResaltadas={[]} onVerAlertas={() => undefined} />)
  act(() => window.dispatchEvent(new CustomEvent('radar-meteo-map-ready', { detail: crearMapa() })))
}

function clicEnMapa() {
  act(() => window.dispatchEvent(new CustomEvent('radar-meteo-map-click', { detail: { lat: celda.lat, lng: celda.lon } })))
}

const PUNTO = { name: 'Pronóstico en el punto seleccionado' }

describe('RadarMeteo — un solo overlay a la vez', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', () => 1)
    vi.stubGlobal('cancelAnimationFrame', () => undefined)
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)))
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null)
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('abrir la tarjeta de escuela cierra el pronóstico del punto', () => {
    montar()
    clicEnMapa()
    expect(screen.getByRole('dialog', PUNTO)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Pronóstico de Escuela Rural/ }))

    expect(screen.queryByRole('dialog', PUNTO)).toBeNull()
    expect(document.querySelector('.radar-escuela-card')).not.toBeNull()
  })

  it('un clic en el mapa cierra la tarjeta de escuela y abre el pronóstico del punto', () => {
    montar()
    fireEvent.click(screen.getByRole('button', { name: /Pronóstico de Escuela Rural/ }))
    expect(document.querySelector('.radar-escuela-card')).not.toBeNull()

    clicEnMapa()

    expect(document.querySelector('.radar-escuela-card')).toBeNull()
    expect(screen.getByRole('dialog', PUNTO)).toBeInTheDocument()
  })
})
