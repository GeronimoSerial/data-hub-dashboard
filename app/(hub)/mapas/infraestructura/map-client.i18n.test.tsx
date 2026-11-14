// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { InfraestructuraMapClient } from './map-client'
import { IdiomaProvider } from '@/lib/i18n/idioma-provider'
import { __reiniciarIdiomaClienteParaPruebas } from '@/lib/i18n/idioma-cliente'

vi.mock('@/components/mapas/map-infraestructura-page', () => ({
  default: () => <div data-testid="mock-mapa" />,
}))

vi.mock('@/lib/infraestructura/use-escuelas-mapa', () => ({
  useEscuelasMapa: () => ({ data: null, loading: false, error: null }),
}))

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  window.history.pushState({}, '', '/')
  __reiniciarIdiomaClienteParaPruebas()
})

describe('InfraestructuraMapClient · idioma español (default)', () => {
  it('mantiene el nombre de la barra de modos y las pestañas originales', () => {
    render(<InfraestructuraMapClient mostrarEnlaceNominal riskRadarEnabled />)

    expect(screen.getByRole('tablist', { name: 'Modos y vistas de ENOS Corrientes' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Situación actual' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Radar' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Planificación' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Capas' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Estadísticas' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Exportar' })).toBeTruthy()
  })

  it('mantiene los enlaces Call center y Cuadernillos', () => {
    render(<InfraestructuraMapClient mostrarEnlaceNominal mostrarCallCenter mostrarCuadernillos />)

    expect(screen.getByRole('link', { name: 'Call center' }).getAttribute('href')).toBe('/call-center')
    expect(screen.getByRole('link', { name: 'Cuadernillos' }).getAttribute('href')).toBe('/cuadernillos')
  })
})

describe('InfraestructuraMapClient · idioma portugués', () => {
  it('muestra la barra de modos y las pestañas en portugués', () => {
    render(
      <IdiomaProvider idioma="pt">
        <InfraestructuraMapClient mostrarEnlaceNominal riskRadarEnabled />
      </IdiomaProvider>,
    )

    expect(screen.getByRole('tablist', { name: 'Modos e visualizações de ENOS Corrientes' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Situação atual' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Radar de risco' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Planejamento' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Camadas' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Estatísticas' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Exportação' })).toBeTruthy()
  })

  it('muestra los enlaces en portugués', () => {
    render(
      <IdiomaProvider idioma="pt">
        <InfraestructuraMapClient mostrarEnlaceNominal mostrarCallCenter mostrarCuadernillos />
      </IdiomaProvider>,
    )

    expect(screen.getByRole('link', { name: 'Central de chamadas' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Cadernos' })).toBeTruthy()
  })
})
