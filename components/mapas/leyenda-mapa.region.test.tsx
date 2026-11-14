// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { IdiomaProvider } from '@/lib/i18n/idioma-provider'
import { __reiniciarIdiomaClienteParaPruebas } from '@/lib/i18n/idioma-cliente'
import { cargarRegion, regionPublica, type RegionPublica } from '@/lib/infraestructura/region/index'
import { __reiniciarRegionPublicaClienteParaPruebas, fijarRegionPublicaCliente } from '@/lib/infraestructura/region/publica'
import { LeyendaMapa } from './leyenda-mapa'

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

describe('LeyendaMapa · región sin Prefectura', () => {
  it('no muestra el bloque de estaciones de Prefectura en español', () => {
    fijarRegionPublicaCliente(manaosLike())
    render(<LeyendaMapa pestana="actual" estacionesRio />)

    expect(screen.queryByTestId('leyenda-estaciones')).toBeNull()
    expect(screen.queryByText('Estaciones de Prefectura')).toBeNull()
    expect(screen.queryByText('Evacuación')).toBeNull()
    expect(screen.getByText('Gravedad / prioridad')).toBeInTheDocument()
  })

  it('no muestra el bloque de estaciones de Prefeitura en portugués', () => {
    fijarRegionPublicaCliente(manaosLike())
    render(
      <IdiomaProvider idioma="pt">
        <LeyendaMapa pestana="actual" estacionesRio />
      </IdiomaProvider>,
    )

    expect(screen.queryByTestId('leyenda-estaciones')).toBeNull()
    expect(screen.queryByText('Estações da Prefeitura')).toBeNull()
    expect(screen.queryByText('Evacuação')).toBeNull()
    expect(screen.getByText('Gravidade / prioridade')).toBeInTheDocument()
  })
})

describe('LeyendaMapa · región con Prefectura (Corrientes)', () => {
  it('muestra el bloque de estaciones de Prefectura en español', () => {
    render(<LeyendaMapa pestana="actual" estacionesRio />)

    const bloque = within(screen.getByTestId('leyenda-estaciones'))
    expect(bloque.getByText('Estaciones de Prefectura')).toBeInTheDocument()
    expect(bloque.getByText('Evacuación')).toBeInTheDocument()
    expect(bloque.getByText('Alerta')).toBeInTheDocument()
  })

  it('muestra el bloque de estaciones de Prefeitura en portugués', () => {
    render(
      <IdiomaProvider idioma="pt">
        <LeyendaMapa pestana="actual" estacionesRio />
      </IdiomaProvider>,
    )

    const bloque = within(screen.getByTestId('leyenda-estaciones'))
    expect(bloque.getByText('Estações da Prefeitura')).toBeInTheDocument()
    expect(bloque.getByText('Evacuação')).toBeInTheDocument()
  })
})
