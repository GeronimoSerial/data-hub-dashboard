// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { RegionProvider, useRegion } from './region-provider'
import { __reiniciarRegionPublicaClienteParaPruebas } from './publica'
import { cargarRegion, regionPublica } from './index'

const manaos = {
  ...regionPublica(cargarRegion('corrientes')),
  id: 'otra',
  zonaHoraria: 'America/Manaus',
  locale: 'pt-BR',
  idiomas: ['pt'] as ['pt'],
}

function Zona() {
  const r = useRegion()
  return <p>{`${r.id}|${r.zonaHoraria}`}</p>
}

describe('RegionProvider', () => {
  beforeEach(() => __reiniciarRegionPublicaClienteParaPruebas())
  afterEach(() => cleanup())

  it('renders children unchanged', () => {
    render(
      <RegionProvider region={manaos}>
        <span>contenido</span>
      </RegionProvider>,
    )
    expect(screen.getByText('contenido')).toBeInTheDocument()
  })

  it('makes the region available to useRegion before children render', () => {
    render(
      <RegionProvider region={manaos}>
        <Zona />
      </RegionProvider>,
    )
    expect(screen.getByText('otra|America/Manaus')).toBeInTheDocument()
  })

  it('is idempotent across re-renders', () => {
    const { rerender } = render(
      <RegionProvider region={manaos}>
        <Zona />
      </RegionProvider>,
    )
    rerender(
      <RegionProvider region={manaos}>
        <Zona />
      </RegionProvider>,
    )
    expect(screen.getByText('otra|America/Manaus')).toBeInTheDocument()
  })
})
