// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
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

const escuelaTatacua = escuela({ cueAnexo: '1800087-00', nombre: 'Escuela N° 87 Colonia Tatacuá', departamento: 'San Roque' })

function FiltrosControlados({ escuelas, onSeleccionar }: {
  escuelas: EscuelaMapaEnriquecida[]
  onSeleccionar: (cueAnexo: string) => void
}) {
  const [filtros, setFiltros] = React.useState(FILTROS_MAPA_VACIOS)
  return <FiltrosChips escuelas={escuelas} filtros={filtros} onChange={setFiltros} onSeleccionar={onSeleccionar} />
}

afterEach(cleanup)

describe('FiltrosChips', () => {
  it('abre el popover de Departamento hacia abajo', async () => {
    const user = userEvent.setup()
    renderFiltros()

    await user.click(screen.getByRole('button', { name: 'Departamento' }))
    const popup = screen.getByRole('dialog', { name: 'Departamento' })
    const posicionador = popup.closest('.filtros-popover-posicionador')

    expect(popup).toHaveAttribute('data-apertura', 'abajo')
    expect(posicionador).not.toBeNull()
    expect(posicionador).toHaveAttribute('data-side', 'bottom')
  })

  it('limita la altura del popover y permite desplazarse por sus opciones', () => {
    const css = readFileSync('app/globals.css', 'utf8')
    const reglaPopover = css.match(/\.filtros-popover\s*\{[^}]*\}/)?.[0]

    expect(reglaPopover).toBeDefined()
    expect(reglaPopover).toMatch(/overflow-y:\s*auto/)
    expect(reglaPopover).toMatch(/max-height:/)
  })

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

  it('mantiene Limpiar filtros junto a Sin actualizar al envolver los chips', () => {
    renderFiltros({ ...FILTROS_MAPA_VACIOS, q: 'Goya' })

    const sinActualizar = screen.getByRole('button', { name: /Sin actualizar/ })
    const limpiar = screen.getByRole('button', { name: 'Limpiar filtros' })
    const contenedor = sinActualizar.closest('.filtros-chip-final')

    expect(contenedor).not.toBeNull()
    expect(contenedor).toContainElement(limpiar)
  })

  it('cada opción muestra cuántas escuelas tiene', async () => {
    const user = userEvent.setup()
    renderFiltros()
    await user.click(screen.getByRole('button', { name: /Nivel/ }))

    const primario = screen.getByRole('checkbox', { name: /Primario/ })
    expect(primario).toHaveAccessibleName(/Primario.*2/)
  })

  it('muestra un estado vacío en Nivel cuando el padrón no trae niveles', async () => {
    const user = userEvent.setup()
    const escuelasSinNiveles = [escuela({ niveles: [] })]
    render(<FiltrosChips escuelas={escuelasSinNiveles} filtros={FILTROS_MAPA_VACIOS} onChange={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Nivel' }))

    expect(screen.getByText('No hay niveles cargados en el padrón.')).toBeInTheDocument()
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

  it('presenta departamento con tildes en el popover y el chip activo, conservando el valor del padrón', async () => {
    const user = userEvent.setup()
    const bellaVista = escuela({ departamento: 'BELLA VISTA' })
    const onChange = vi.fn()
    render(<FiltrosChips escuelas={[bellaVista]} filtros={FILTROS_MAPA_VACIOS} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Departamento' }))
    const opcion = screen.getByRole('checkbox', { name: /Bella Vista/ })
    expect(opcion).toBeInTheDocument()
    await user.click(opcion)
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ departamentos: ['BELLA VISTA'] }))

    cleanup()
    render(<FiltrosChips escuelas={[bellaVista]} filtros={{ ...FILTROS_MAPA_VACIOS, departamentos: ['BELLA VISTA'] }} onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Departamento: Bella Vista' })).toBeInTheDocument()
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

    fireEvent.change(screen.getByRole('combobox', { name: 'Buscar escuela o CUE' }), { target: { value: 'Tatacuá' } })
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'Tatacuá' }))
  })

  it('muestra sugerencias por nombre y selecciona con Enter limpiando la búsqueda', async () => {
    const user = userEvent.setup()
    const onSeleccionar = vi.fn()
    render(<FiltrosControlados escuelas={[escuelaTatacua]} onSeleccionar={onSeleccionar} />)

    const busqueda = screen.getByRole('combobox', { name: 'Buscar escuela o CUE' })
    await user.type(busqueda, 'tatacua')
    expect(screen.getByRole('listbox')).toHaveTextContent('Escuela N° 87 Colonia Tatacuá')
    expect(screen.getByRole('option')).toHaveTextContent('1800087-00')

    await user.keyboard('{Enter}')
    expect(onSeleccionar).toHaveBeenCalledWith('1800087-00')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(busqueda).toHaveValue('')
  })

  it('presenta con tildes el departamento en el detalle de sugerencias', async () => {
    const user = userEvent.setup()
    const escuelaConPadron = escuela({ departamento: 'SAN LUIS DEL PALMAR' })
    render(<FiltrosControlados escuelas={[escuelaConPadron]} onSeleccionar={vi.fn()} />)

    await user.type(screen.getByRole('combobox', { name: 'Buscar escuela o CUE' }), 'ejemplo')
    expect(screen.getByRole('option')).toHaveTextContent('1800001-00 · San Luis del Palmar')
  })

  it('muestra un estado cuando la búsqueda no tiene resultados', async () => {
    const user = userEvent.setup()
    render(<FiltrosControlados escuelas={[escuelaTatacua]} onSeleccionar={vi.fn()} />)
    await user.type(screen.getByRole('combobox', { name: 'Buscar escuela o CUE' }), 'sin coincidencias')
    const sugerencias = screen.getByRole('listbox', { name: 'Escuelas coincidentes' })
    expect(within(sugerencias).getByRole('status')).toHaveTextContent('Ninguna escuela coincide')
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
  })

  it('cambia la opción activa con flechas y Esc cierra sin limpiar', async () => {
    const user = userEvent.setup()
    render(<FiltrosControlados escuelas={[escuelaTatacua, escuela({ cueAnexo: '1800088-00', nombre: 'Escuela N° 88 Tatacuá' })]} onSeleccionar={vi.fn()} />)
    const busqueda = screen.getByRole('combobox', { name: 'Buscar escuela o CUE' })
    await user.type(busqueda, 'tatacua')
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('option', { name: /1800088-00/ })).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{ArrowUp}')
    expect(screen.getByRole('option', { name: /1800087-00/ })).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(busqueda).toHaveValue('tatacua')
  })

  it('respeta los demás filtros activos al sugerir escuelas', async () => {
    const user = userEvent.setup()
    const primario = escuelaTatacua
    const secundario = escuela({ cueAnexo: '1800088-00', nombre: 'Escuela Secundaria Tatacuá', niveles: ['Secundario'] })
    render(<FiltrosChips escuelas={[primario, secundario]} filtros={{ ...FILTROS_MAPA_VACIOS, niveles: ['Secundario'], q: 'tatacua' }} onChange={vi.fn()} onSeleccionar={vi.fn()} />)
    await user.click(screen.getByRole('combobox', { name: 'Buscar escuela o CUE' }))
    expect(screen.getByRole('option')).toHaveTextContent('1800088-00')
    expect(screen.queryByText('1800087-00')).not.toBeInTheDocument()
  })
})
