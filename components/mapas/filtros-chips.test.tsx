// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FiltrosChips } from './filtros-chips'
import { FILTROS_MAPA_VACIOS, type EscuelaMapaEnriquecida, type FiltrosMapa } from '@/lib/infraestructura/mapa/tipos'

function escuela(overrides: Partial<EscuelaMapaEnriquecida> = {}): EscuelaMapaEnriquecida {
  return {
    cueAnexo: '1800001-00',
    nombre: 'Escuela de ejemplo',
    departamento: 'Goya',
    localidad: 'Goya',
    lat: null,
    lon: null,
    niveles: ['Primario'],
    alumnos: 100,
    gravedad: 2,
    categoriaPrincipal: null,
    clases: 'normal',
    apoyo: 'no',
    sinActualizar: false,
    ultimaNovedad: null,
    alumnosSinClases: 0,
    ...overrides,
  }
}

const padronEjemplo = [
  escuela(),
  escuela({ cueAnexo: '1800002-00', nombre: 'Escuela rural', departamento: 'Esquina', niveles: ['Primario', 'Inicial'], gravedad: 4, apoyo: 'virtual' }),
  escuela({ cueAnexo: '1800003-00', nombre: 'Escuela secundaria', niveles: ['Secundario'], clases: 'sin', apoyo: 'cuadernillo', sinActualizar: true }),
]

function renderFiltros(filtros: FiltrosMapa = FILTROS_MAPA_VACIOS, onChange = vi.fn()) {
  return { onChange, ...render(<FiltrosChips escuelas={padronEjemplo} filtros={filtros} onChange={onChange} />) }
}

afterEach(cleanup)

describe('FiltrosChips', () => {
  it('elegir Primario en Nivel filtra y muestra el chip activo con su ×', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderFiltros(FILTROS_MAPA_VACIOS, onChange)

    await user.click(screen.getByRole('button', { name: /Nivel/ }))
    await user.click(screen.getByRole('checkbox', { name: /Primario/ }))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ niveles: ['Primario'] }))
  })

  it('la × de un chip activo limpia sólo ese filtro', async () => {
    const user = userEvent.setup()
    const filtros = { ...FILTROS_MAPA_VACIOS, niveles: ['Primario'], departamentos: ['Goya'] }
    const { onChange } = renderFiltros(filtros, vi.fn())

    await user.click(screen.getByRole('button', { name: 'Quitar filtro Nivel' }))
    expect(onChange).toHaveBeenLastCalledWith({ ...filtros, niveles: [] })
  })

  it('Limpiar filtros aparece sólo con algún filtro activo', () => {
    const { rerender } = renderFiltros()
    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument()

    rerender(<FiltrosChips escuelas={padronEjemplo} filtros={{ ...FILTROS_MAPA_VACIOS, q: 'Goya' }} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Limpiar filtros' })).toBeInTheDocument()
  })

  it('cada opción muestra cuántas escuelas tiene', async () => {
    const user = userEvent.setup()
    renderFiltros()
    await user.click(screen.getByRole('button', { name: /Nivel/ }))

    const primario = screen.getByRole('checkbox', { name: /Primario/ })
    expect(primario).toHaveAccessibleName(/Primario.*2/)
  })

  it('Esc cierra el popover y devuelve el foco al chip', async () => {
    const user = userEvent.setup()
    renderFiltros()
    const chip = screen.getByRole('button', { name: /Nivel/ })
    await user.click(chip)
    const opcion = screen.getByRole('checkbox', { name: /Inicial/ })
    expect(opcion).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Nivel' })).not.toBeInTheDocument()
    expect(chip).toHaveFocus()
  })

  it('muestra el valor de un chip activo o la cantidad de opciones elegidas', () => {
    const filtros = { ...FILTROS_MAPA_VACIOS, niveles: ['Primario'], departamentos: ['Goya', 'Esquina'] }
    renderFiltros(filtros)
    expect(screen.getByRole('button', { name: /Nivel: Primario/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Departamento: 2 elegidos/ })).toBeInTheDocument()
  })

  it('Sin actualizar alterna su estado', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderFiltros(FILTROS_MAPA_VACIOS, onChange)

    await user.click(screen.getByRole('button', { name: /Sin actualizar/ }))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ sinActualizar: true }))
  })

  it('escribir en la búsqueda llama onChange con q', () => {
    const onChange = vi.fn()
    renderFiltros(FILTROS_MAPA_VACIOS, onChange)

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar escuela o CUE' }), { target: { value: 'Tatacuá' } })
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'Tatacuá' }))
  })
})
