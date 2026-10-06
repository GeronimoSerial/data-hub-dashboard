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
    situacionesHistoricas: 0, solucionadasRecientes: 0,
    ...overrides,
  }
}

const padronEjemplo = [
  escuela(),
  escuela({ cueAnexo: '1800002-00', nombre: 'Escuela rural', departamento: 'Esquina', niveles: ['Primario', 'Inicial'], gravedad: 4, apoyo: 'virtual' }),
  escuela({ cueAnexo: '1800003-00', nombre: 'Escuela secundaria', niveles: ['Secundario'], clases: 'sin', apoyo: 'cuadernillo', sinActualizar: true }),
  escuela({ cueAnexo: '1800004-00', nombre: 'Escuela sin dato', niveles: [], clases: 'sin', apoyo: 'sin_dato' }),
]

function renderFiltros(filtros: FiltrosMapa = FILTROS_MAPA_VACIOS, onChange = vi.fn()) {
  return { onChange, ...render(<FiltrosChips escuelas={padronEjemplo} filtros={filtros} onChange={onChange} />) }
}

function getChip(nombre: string | RegExp) {
  const principales = document.querySelector<HTMLElement>('.filtros-chips-principales')
  if (principales === null) throw new Error('No se encontró el grupo de chips principales')
  return within(principales).getByRole('button', { name: nombre })
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
  it('deja Departamento, Nivel, Gravedad y Clases en el grupo de chips en línea', () => {
    renderFiltros()
    const principales = document.querySelector<HTMLElement>('.filtros-chips-principales')
    if (principales === null) throw new Error('No se encontró el grupo de chips principales')
    expect(within(principales).getAllByRole('button').map((boton) => boton.textContent?.trim())).toEqual([
      'Departamento', 'Nivel', 'Gravedad', 'Clases',
    ])
  })

  it('abre el popover de Departamento hacia abajo', async () => {
    const user = userEvent.setup()
    renderFiltros()

    await user.click(getChip('Departamento'))
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

  it('mantiene un único quiebre en rango 1100–1250 px y agrupa las reglas compactas', () => {
    const css = readFileSync('app/globals.css', 'utf8')
    const bloques = [...css.matchAll(/@container\s*\(([^)]*)\)\s*\{([\s\S]*?)\n\}/g)]
      .filter(([, , reglas]) => reglas?.includes('.mapa-pestanas-barra .filtros-compactos-boton')
        || reglas?.includes('.mapa-pestanas-barra .filtros-controles'))

    expect(bloques).toHaveLength(1)
    const condicion = bloques[0]?.[1] ?? ''
    const ancho = Number(condicion.match(/max-width:\s*(\d+)px/)?.[1])
    expect(ancho).toBe(1200)
    expect(bloques[0]?.[2]).toContain('.mapa-pestanas-barra .filtros-compactos-boton')
    expect(bloques[0]?.[2]).toContain('.mapa-pestanas-barra .filtros-controles')
    expect(bloques[0]?.[2]).toContain('.mapa-pestanas-barra .filtros-chips-principales')
    expect(bloques[0]?.[2]).toContain('.mapa-pestanas-barra .filtros-mas')
    expect(bloques[0]?.[2]).toMatch(/\.filtros-mas\s*\{[^}]*display:\s*none/)
  })

  it('mantiene cuatro chips principales en una sola línea en modo ancho', () => {
    const css = readFileSync('app/globals.css', 'utf8')
    const regla = css.match(/\.mapa-pestanas-barra \.filtros-chips-principales\s*\{[^}]*\}/)?.[0]

    expect(regla).toMatch(/flex-wrap:\s*nowrap/)
  })

  it('abre Más filtros con asistencia pedagógica y dos switches, y cuenta todos los activos', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderFiltros(FILTROS_MAPA_VACIOS, onChange)
    const boton = screen.getByRole('button', { name: 'Más filtros' })

    expect(boton).toHaveAttribute('aria-expanded', 'false')
    await user.click(boton)
    const dialog = screen.getByRole('dialog', { name: 'Más filtros' })
    expect(within(dialog).getByText('Asistencia pedagógica')).toBeInTheDocument()
    const brindar = within(dialog).getByRole('checkbox', { name: /Se brinda/ })
    const sinActualizar = within(dialog).getByRole('switch', { name: 'Sin actualizar' })
    const solucionadas = within(dialog).getByRole('switch', { name: 'Solucionadas en los últimos 15 días' })
    await user.click(brindar)
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ apoyo: ['brinda'] }))
    await user.click(sinActualizar)
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ sinActualizar: true }))
    await user.click(solucionadas)
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ solucionadasRecientes: true }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Más filtros' })).not.toBeInTheDocument()

    await user.click(boton)
    await user.click(document.body)
    expect(boton).toHaveAttribute('aria-expanded', 'false')

    cleanup()
    renderFiltros({ ...FILTROS_MAPA_VACIOS, apoyo: ['brinda'], sinActualizar: true })
    expect(screen.getByRole('button', { name: 'Más filtros, 2 activos' })).toBeInTheDocument()
  })

  it('elegir Primario en Nivel filtra y muestra el chip activo con su ×', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderFiltros(FILTROS_MAPA_VACIOS, onChange)

    await user.click(getChip(/Nivel/))
    await user.click(screen.getByRole('checkbox', { name: /Primario/ }))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ niveles: ['Primario'] }))
  })

  it('la × de un chip activo limpia sólo ese filtro', async () => {
    const user = userEvent.setup()
    const filtros = { ...FILTROS_MAPA_VACIOS, niveles: ['Primario'], departamentos: ['Goya'] }
    const { onChange } = renderFiltros(filtros, vi.fn())

    await user.click(getChip('Quitar filtro Nivel'))
    expect(onChange).toHaveBeenLastCalledWith({ ...filtros, niveles: [] })
  })

  it('Limpiar filtros aparece sólo con algún filtro activo', () => {
    const { rerender } = renderFiltros()
    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument()

    rerender(<FiltrosChips escuelas={padronEjemplo} filtros={{ ...FILTROS_MAPA_VACIOS, q: 'Goya' }} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Limpiar filtros' })).toBeInTheDocument()
  })

  it('mantiene Limpiar filtros junto a los interruptores en el panel compacto', () => {
    renderFiltros({ ...FILTROS_MAPA_VACIOS, q: 'Goya' })

    const sinActualizar = screen.getByRole('button', { name: 'Sin actualizar' })
    const limpiar = screen.getByRole('button', { name: 'Limpiar filtros' })
    const contenedor = sinActualizar.closest('.filtros-chip-final')

    expect(contenedor).not.toBeNull()
    expect(contenedor).toContainElement(limpiar)
  })

  it('cada opción muestra cuántas escuelas tiene', async () => {
    const user = userEvent.setup()
    renderFiltros()
    await user.click(getChip(/Nivel/))

    const primario = screen.getByRole('checkbox', { name: /Primario/ })
    expect(primario).toHaveAccessibleName(/Primario.*2/)
  })

  it('muestra las etiquetas canónicas de gravedad y estado de clases', async () => {
    const user = userEvent.setup()
    renderFiltros()

    await user.click(getChip('Gravedad'))
    expect(screen.getByRole('checkbox', { name: /Sin situaciones/ })).toBeInTheDocument()
    await user.click(getChip('Clases'))
    expect(screen.getByRole('checkbox', { name: /Funcionamiento habitual/ })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Funcionamiento parcialmente interrumpido/ })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Funcionamiento interrumpido/ })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Usado como centro de evacuados/ })).toBeInTheDocument()
  })

  it('ofrece las tres opciones de asistencia pedagógica en Más filtros y filtra con sus valores canónicos', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderFiltros(FILTROS_MAPA_VACIOS, onChange)

    await user.click(screen.getByRole('button', { name: 'Más filtros' }))
    const dialog = screen.getByRole('dialog', { name: 'Más filtros' })
    expect(within(dialog).getByText('Asistencia pedagógica')).toBeInTheDocument()
    expect(within(dialog).getAllByRole('checkbox')).toHaveLength(3)
    expect(within(dialog).getByRole('checkbox', { name: /Se brinda/ })).toBeInTheDocument()
    expect(within(dialog).getByRole('checkbox', { name: /No se brinda/ })).toBeInTheDocument()
    expect(within(dialog).getByRole('checkbox', { name: /Sin dato/ })).toBeInTheDocument()

    await user.click(within(dialog).getByRole('checkbox', { name: /Se brinda/ }))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ apoyo: ['brinda'] }))
  })

  it('renderiza cada opción del popover con el Checkbox del sistema', async () => {
    const user = userEvent.setup()
    renderFiltros()
    await user.click(getChip(/Nivel/))

    const popover = screen.getByRole('dialog', { name: 'Nivel' })
    const opciones = within(popover).getAllByRole('checkbox')
    const filas = popover.querySelectorAll(':scope > label.filtros-opcion.ui-checkbox')
    const inputsSueltos = [...popover.querySelectorAll('input[type="checkbox"]')]
      .filter((input) => input.closest('.ui-checkbox') === null)

    expect(opciones.length).toBeGreaterThan(0)
    expect(opciones.every((opcion) => opcion.classList.contains('ui-checkbox__control'))).toBe(true)
    expect(filas).toHaveLength(opciones.length)
    expect(popover.querySelectorAll('label.filtros-opcion:not(.ui-checkbox)')).toHaveLength(0)
    expect(inputsSueltos).toHaveLength(0)
  })

  it('muestra un estado vacío en Nivel cuando el padrón no trae niveles', async () => {
    const user = userEvent.setup()
    const escuelasSinNiveles = [escuela({ niveles: [] })]
    render(<FiltrosChips escuelas={escuelasSinNiveles} filtros={FILTROS_MAPA_VACIOS} onChange={vi.fn()} />)

    await user.click(getChip('Nivel'))

    expect(screen.getByText('No hay niveles cargados en el padrón.')).toBeInTheDocument()
  })

  it('Esc cierra el popover y devuelve el foco al chip', async () => {
    const user = userEvent.setup()
    renderFiltros()
    const chip = getChip(/Nivel/)
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
    expect(getChip(/Nivel: Primario/)).toBeInTheDocument()
    expect(getChip(/Departamento: 2 elegidos/)).toBeInTheDocument()
  })

  it('presenta departamento con tildes en el popover y el chip activo, conservando el valor del padrón', async () => {
    const user = userEvent.setup()
    const bellaVista = escuela({ departamento: 'BELLA VISTA' })
    const onChange = vi.fn()
    render(<FiltrosChips escuelas={[bellaVista]} filtros={FILTROS_MAPA_VACIOS} onChange={onChange} />)

    await user.click(getChip('Departamento'))
    const opcion = screen.getByRole('checkbox', { name: /Bella Vista/ })
    expect(opcion).toBeInTheDocument()
    await user.click(opcion)
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ departamentos: ['BELLA VISTA'] }))

    cleanup()
    render(<FiltrosChips escuelas={[bellaVista]} filtros={{ ...FILTROS_MAPA_VACIOS, departamentos: ['BELLA VISTA'] }} onChange={vi.fn()} />)
    expect(getChip('Departamento: Bella Vista')).toBeInTheDocument()
  })

  it('Sin actualizar alterna su estado', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderFiltros(FILTROS_MAPA_VACIOS, onChange)

    const chip = document.querySelector<HTMLElement>('.filtros-controles .filtros-chip--interruptor')
    if (chip === null) throw new Error('No se encontró el interruptor Sin actualizar')
    await user.click(chip)
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ sinActualizar: true }))
  })

  it('Solucionadas en los últimos 15 días alterna su filtro y permite limpiarlo', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { rerender } = renderFiltros(FILTROS_MAPA_VACIOS, onChange)
    const nombre = 'Solucionadas en los últimos 15 días'
    const chip = document.querySelector<HTMLElement>('.filtros-controles .filtros-chip--interruptor:last-of-type')
    if (chip === null) throw new Error('No se encontró el interruptor de situaciones solucionadas')

    expect(chip).toHaveClass('filtros-chip--interruptor')
    expect(chip).toHaveAccessibleName(nombre)
    expect(chip).toHaveAttribute('aria-pressed', 'false')
    await user.click(chip)
    expect(onChange).toHaveBeenLastCalledWith({ ...FILTROS_MAPA_VACIOS, solucionadasRecientes: true })

    rerender(<FiltrosChips escuelas={padronEjemplo} filtros={{ ...FILTROS_MAPA_VACIOS, solucionadasRecientes: true }} onChange={onChange} />)
    expect(screen.getByRole('button', { name: /Solucionadas en los últimos 15 días/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Limpiar filtros' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Solucionadas en los últimos 15 días/ }))
    expect(onChange).toHaveBeenLastCalledWith(FILTROS_MAPA_VACIOS)
  })

  it('escribir en la búsqueda llama onChange con q', () => {
    const onChange = vi.fn()
    renderFiltros(FILTROS_MAPA_VACIOS, onChange)

    fireEvent.click(screen.getByRole('button', { name: 'Buscar escuela o CUE' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Buscar escuela o CUE' }), { target: { value: 'Tatacuá' } })
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'Tatacuá' }))
  })

  it('abre la búsqueda con foco y la colapsa con Escape cuando no hay sugerencias', async () => {
    const user = userEvent.setup()
    renderFiltros()

    const abrir = screen.getByRole('button', { name: 'Buscar escuela o CUE' })
    expect(abrir).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('combobox', { name: 'Buscar escuela o CUE' })).not.toBeInTheDocument()
    await user.click(abrir)
    const busqueda = screen.getByRole('combobox', { name: 'Buscar escuela o CUE' })
    expect(busqueda).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('combobox', { name: 'Buscar escuela o CUE' })).not.toBeInTheDocument()
  })

  it('colapsa al perder el foco si está vacía y permanece abierta si tiene texto', async () => {
    const user = userEvent.setup()
    const { rerender } = renderFiltros()
    await user.click(screen.getByRole('button', { name: 'Buscar escuela o CUE' }))
    const busqueda = screen.getByRole('combobox', { name: 'Buscar escuela o CUE' })
    fireEvent.blur(busqueda)
    expect(screen.queryByRole('combobox', { name: 'Buscar escuela o CUE' })).not.toBeInTheDocument()

    rerender(<FiltrosChips escuelas={padronEjemplo} filtros={{ ...FILTROS_MAPA_VACIOS, q: 'Goya' }} onChange={() => {}} />)
    expect(screen.getByRole('combobox', { name: 'Buscar escuela o CUE' })).toHaveValue('Goya')
  })

  it('con texto Escape cierra las sugerencias sin colapsar la búsqueda', async () => {
    const user = userEvent.setup()
    render(<FiltrosControlados escuelas={[escuelaTatacua]} onSeleccionar={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Buscar escuela o CUE' }))
    const busqueda = screen.getByRole('combobox', { name: 'Buscar escuela o CUE' })
    await user.type(busqueda, 'tatacua')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(busqueda).toHaveValue('tatacua')
    expect(busqueda).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.getByRole('combobox', { name: 'Buscar escuela o CUE' })).toHaveValue('tatacua')
  })

  it('muestra sugerencias por nombre y selecciona con Enter limpiando la búsqueda', async () => {
    const user = userEvent.setup()
    const onSeleccionar = vi.fn()
    render(<FiltrosControlados escuelas={[escuelaTatacua]} onSeleccionar={onSeleccionar} />)

    await user.click(screen.getByRole('button', { name: 'Buscar escuela o CUE' }))
    const busqueda = screen.getByRole('combobox', { name: 'Buscar escuela o CUE' })
    await user.type(busqueda, 'tatacua')
    expect(screen.getByRole('listbox')).toHaveTextContent('Escuela N° 87 Colonia Tatacuá')
    expect(screen.getByRole('option')).toHaveTextContent('1800087-00')

    await user.keyboard('{Enter}')
    expect(onSeleccionar).toHaveBeenCalledWith('1800087-00')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Buscar escuela o CUE' })).not.toBeInTheDocument()
  })

  it('presenta con tildes el departamento en el detalle de sugerencias', async () => {
    const user = userEvent.setup()
    const escuelaConPadron = escuela({ departamento: 'SAN LUIS DEL PALMAR' })
    render(<FiltrosControlados escuelas={[escuelaConPadron]} onSeleccionar={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Buscar escuela o CUE' }))
    await user.type(screen.getByRole('combobox', { name: 'Buscar escuela o CUE' }), 'ejemplo')
    expect(screen.getByRole('option')).toHaveTextContent('1800001-00 · San Luis del Palmar')
  })

  it('muestra un estado cuando la búsqueda no tiene resultados', async () => {
    const user = userEvent.setup()
    render(<FiltrosControlados escuelas={[escuelaTatacua]} onSeleccionar={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Buscar escuela o CUE' }))
    await user.type(screen.getByRole('combobox', { name: 'Buscar escuela o CUE' }), 'sin coincidencias')
    const sugerencias = screen.getByRole('listbox', { name: 'Escuelas coincidentes' })
    expect(within(sugerencias).getByRole('status')).toHaveTextContent('Ninguna escuela coincide')
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
  })

  it('cambia la opción activa con flechas y Esc cierra sin limpiar', async () => {
    const user = userEvent.setup()
    render(<FiltrosControlados escuelas={[escuelaTatacua, escuela({ cueAnexo: '1800088-00', nombre: 'Escuela N° 88 Tatacuá' })]} onSeleccionar={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Buscar escuela o CUE' }))
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
    const primario = escuelaTatacua
    const secundario = escuela({ cueAnexo: '1800088-00', nombre: 'Escuela Secundaria Tatacuá', niveles: ['Secundario'] })
    render(<FiltrosChips escuelas={[primario, secundario]} filtros={{ ...FILTROS_MAPA_VACIOS, niveles: ['Secundario'], q: 'tatacua' }} onChange={vi.fn()} onSeleccionar={vi.fn()} />)
    expect(screen.getByRole('option')).toHaveTextContent('1800088-00')
    expect(screen.queryByText('1800087-00')).not.toBeInTheDocument()
  })

  it('abre y cierra el panel compacto con Escape o clic fuera y cuenta los filtros activos', async () => {
    const user = userEvent.setup()
    renderFiltros({ ...FILTROS_MAPA_VACIOS, niveles: ['Primario'], sinActualizar: true })
    const boton = screen.getByRole('button', { name: 'Filtros, 2 activos' })
    const barra = boton.closest('.filtros-barra')

    expect(barra).toHaveAttribute('data-abierto', 'false')
    await user.click(boton)
    expect(barra).toHaveAttribute('data-abierto', 'true')
    await user.keyboard('{Escape}')
    expect(barra).toHaveAttribute('data-abierto', 'false')
    await user.click(boton)
    await user.click(document.body)
    expect(barra).toHaveAttribute('data-abierto', 'false')
  })
})
