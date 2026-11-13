// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { MarcaBanda, MarcaCompacta, MarcaHorizontal, MarcaHorizontalInversa } from './marca'
import { __reiniciarRegionPublicaClienteParaPruebas, fijarMarcaRegionCliente } from '@/lib/infraestructura/region/publica'
import { marcaPublica } from '@/lib/infraestructura/region/esquema'
import { cargarRegion } from '@/lib/infraestructura/region/registro'

afterEach(() => {
  cleanup()
  __reiniciarRegionPublicaClienteParaPruebas()
})

const COMPONENTES = { MarcaBanda, MarcaCompacta, MarcaHorizontal, MarcaHorizontalInversa }

describe('firma institucional por región', () => {
  it.each(Object.entries(COMPONENTES))('Corrientes: %s sigue mostrando la firma de Corrientes', (_nombre, Componente) => {
    const { container } = render(<Componente />)
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img?.getAttribute('src')).toMatch(/^\/marca\//)
  })

  it('Corrientes: textos alternativos exactos', () => {
    expect(render(<MarcaHorizontal />).container.querySelector('img')?.getAttribute('alt')).toBe('Gobierno de Corrientes · Ministerio de Educación')
    cleanup()
    expect(render(<MarcaCompacta />).container.querySelector('img')?.getAttribute('alt')).toBe('Escudo de la Provincia de Corrientes')
  })

  it.each(Object.entries(COMPONENTES))('Manaos: %s no dibuja nada de Corrientes', (_nombre, Componente) => {
    fijarMarcaRegionCliente(marcaPublica(cargarRegion('manaos')))
    const { container } = render(<Componente />)
    expect(container.innerHTML).toBe('')
  })
})
