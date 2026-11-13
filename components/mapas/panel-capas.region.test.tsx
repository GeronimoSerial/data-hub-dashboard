// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { IdiomaProvider } from '@/lib/i18n/idioma-provider'
import { __reiniciarIdiomaClienteParaPruebas } from '@/lib/i18n/idioma-cliente'
import { CAPAS_VISIBLES_DEFAULT } from '@/lib/infraestructura/mapa/capas'
import { cargarRegion, regionPublica, type RegionPublica } from '@/lib/infraestructura/region/index'
import { __reiniciarRegionPublicaClienteParaPruebas, fijarRegionPublicaCliente } from '@/lib/infraestructura/region/publica'
import { PanelCapas } from './panel-capas'

const base = {
  value: 'voyager' as const,
  onChange: () => {},
  capasVisibles: CAPAS_VISIBLES_DEFAULT,
  onCapasVisiblesChange: () => {},
  haySeleccion: false,
  riesgoHoyDisponible: true,
}

const manaosLike = (): RegionPublica => ({
  ...regionPublica(cargarRegion('corrientes')),
  id: 'manaos',
  nombre: 'Manaos',
  fuentesRio: ['ana', 'sgb'],
})

afterEach(() => {
  cleanup()
  __reiniciarRegionPublicaClienteParaPruebas()
  __reiniciarIdiomaClienteParaPruebas()
})

describe('PanelCapas · región sin Prefectura', () => {
  it('no ofrece el interruptor de estaciones de Prefectura en español', () => {
    fijarRegionPublicaCliente(manaosLike())
    render(<PanelCapas {...base} />)

    expect(screen.queryByRole('switch', { name: 'Estaciones de Prefectura (altura de ríos)' })).toBeNull()
    expect(screen.getByRole('switch', { name: 'Lluvia observada (satélite IMERG)' })).toBeTruthy()
  })

  it('no ofrece el interruptor de estaciones de Prefectura en portugués', () => {
    fijarRegionPublicaCliente(manaosLike())
    render(
      <IdiomaProvider idioma="pt">
        <PanelCapas {...base} />
      </IdiomaProvider>,
    )

    expect(screen.queryByRole('switch', { name: 'Estações da Prefectura (altura dos rios)' })).toBeNull()
    expect(screen.getByRole('switch', { name: 'Chuva observada (satélite IMERG)' })).toBeTruthy()
  })
})

describe('PanelCapas · región con Prefectura (Corrientes)', () => {
  it('ofrece el interruptor de estaciones de Prefectura en español', () => {
    render(<PanelCapas {...base} />)

    expect(screen.getByRole('switch', { name: 'Estaciones de Prefectura (altura de ríos)' })).toBeTruthy()
  })

  it('ofrece el interruptor de estaciones de Prefectura en portugués', () => {
    render(
      <IdiomaProvider idioma="pt">
        <PanelCapas {...base} />
      </IdiomaProvider>,
    )

    expect(screen.getByRole('switch', { name: 'Estações da Prefectura (altura dos rios)' })).toBeTruthy()
  })
})
