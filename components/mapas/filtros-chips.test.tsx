// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

let anchoContenedor = 500
const anchosMedicion: Record<string, number> = {
  departamentos: 100, gravedades: 85, clases: 75,
  apoyo: 150, direcciones: 110, sinActualizar: 115, solucionadasRecientes: 205, conComedor: 110, mas: 115,
}
const observadores: ResizeObserverCallback[] = []

class ResizeObserverControlado {
  private readonly callback: ResizeObserverCallback
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
    observadores.push(callback)
  }
  observe() {}
  unobserve() {}
  disconnect() {
    const indice = observadores.indexOf(this.callback)
    if (indice >= 0) observadores.splice(indice, 1)
  }
}

function dispararResize() {
  act(() => observadores.forEach((callback) => callback([], {} as ResizeObserver)))
}

vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
  if (this.matches('.filtros-barra')) return { width: anchoContenedor, height: 36, top: 0, left: 0, right: anchoContenedor, bottom: 36, x: 0, y: 0, toJSON: () => ({}) }
  const clave = this.getAttribute('data-medicion-filtro')
  if (clave) {
    const width = anchosMedicion[clave] ?? 0
    return { width, height: 36, top: 0, left: 0, right: width, bottom: 36, x: 0, y: 0, toJSON: () => ({}) }
  }
  return { width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) }
})
Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
  configurable: true,
  get() {
    if (this.matches('.filtros-barra')) return anchoContenedor
    const clave = this.getAttribute('data-medicion-filtro')
    return clave ? anchosMedicion[clave] ?? 0 : 0
  },
})

beforeEach(() => vi.stubGlobal('ResizeObserver', ResizeObserverControlado))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  anchoContenedor = 500
  observadores.length = 0
  anchosMedicion.departamentos = 100
})

describe('FiltrosChips', () => {
  it('deja Departamento, Gravedad y Clases en el grupo de chips en línea', () => {
    renderFiltros()
    const principales = document.querySelector<HTMLElement>('.filtros-chips-principales')
    if (principales === null) throw new Error('No se encontró el grupo de chips principales')
    expect(within(principales).getAllByRole('button').map((boton) => boton.textContent?.trim())).toEqual([
      'Departamento', 'Gravedad', 'Clases',
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

  it('abre el popover dentro del contenedor indicado, visible en pantalla completa', async () => {
    function ContenedorDePrueba() {
      const ref = React.useRef<HTMLDivElement>(null)
      return (
        <div ref={ref} data-testid="contenedor-pantalla-completa">
          <FiltrosChips escuelas={padronEjemplo} filtros={FILTROS_MAPA_VACIOS} onChange={() => {}} contenedorPopovers={ref} />
        </div>
      )
    }
    render(<ContenedorDePrueba />)
    await userEvent.setup().click(getChip('Departamento'))
    const popup = screen.getByRole('dialog', { name: 'Departamento' })
    expect(screen.getByTestId('contenedor-pantalla-completa')).toContainElement(popup)
  })

  it('limita la altura del popover y permite desplazarse por sus opciones', () => {
    const css = readFileSync('app/globals.css', 'utf8')
    const reglaPopover = css.match(/\.filtros-popover\s*\{[^}]*\}/)?.[0]

    expect(reglaPopover).toBeDefined()
    expect(reglaPopover).toMatch(/overflow-y:\s*auto/)
    expect(reglaPopover).toMatch(/max-height:/)
  })

  it('contrasta el contador de filtros activos dentro del botón activo', () => {
    const css = readFileSync('app/globals.css', 'utf8')
    const regla = css.match(/\.filtros-chip--activo \.filtros-chip__contador\s*\{[^}]*\}/)?.[0]

    expect(regla).toBeDefined()
    expect(regla).toMatch(/background:\s*var\(--page\)/)
    expect(regla).toMatch(/color:\s*var\(--ink\)/)
  })

  it('elimina el breakpoint compacto y hace flexible la fila de filtros', () => {
    const css = readFileSync('app/globals.css', 'utf8')
    expect(css).not.toContain('@container (max-width: 1200px)')
    expect(css).not.toContain('.filtros-compactos-boton')
    expect(css).not.toContain('.filtros-controles')
    const regla = css.match(/\.mapa-pestanas-barra \.filtros-barra\s*\{[^}]*\}/)?.[0]
    expect(regla).toMatch(/flex:\s*1 1 0/)
    expect(regla).toMatch(/min-width:\s*0/)
    expect(regla).toMatch(/justify-content:\s*flex-end/)
    expect(css).toMatch(/\.map-filtros-medicion\s*\{[^}]*visibility:\s*hidden/)
  })

  it('mide los ocho filtros en una fila oculta sin duplicar controles accesibles', () => {
    const css = readFileSync('app/globals.css', 'utf8')
    renderFiltros()
    const fila = document.querySelector<HTMLElement>('.map-filtros-medicion')
    expect(fila).toHaveAttribute('aria-hidden', 'true')
    const regla = readFileSync('app/globals.css', 'utf8').match(/\.map-filtros-medicion\s*\{[^}]*\}/)?.[0]
    expect(regla).toMatch(/visibility:\s*hidden/)
    expect(regla).toMatch(/position:\s*absolute/)
    expect(fila?.querySelectorAll('[data-medicion-filtro]')).toHaveLength(9)
    expect(screen.getAllByRole('button', { name: 'Departamento' })).toHaveLength(1)
    expect(css).toMatch(/\.mapa-pestanas-barra \.filtros-chips-principales\s*\{[^}]*flex-wrap:\s*nowrap/)
  })

  it('muestra los ocho filtros en línea cuando hay ancho de sobra', () => {
    anchoContenedor = 1200
    renderFiltros()
    dispararResize()
    expect(document.querySelectorAll('.filtros-chips-principales .filtros-chip-grupo')).toHaveLength(5)
    expect(document.querySelectorAll('.filtros-chips-principales .filtros-chip--interruptor')).toHaveLength(3)
    expect(screen.queryByRole('button', { name: /Más filtros/ })).not.toBeInTheDocument()
  })

  it('deja cinco filtros en línea y lleva los otros tres al panel en el ancho justo', async () => {
    anchoContenedor = 660
    renderFiltros()
    dispararResize()
    expect(document.querySelectorAll('.filtros-chips-principales .filtros-chip-grupo')).toHaveLength(5)
    const boton = screen.getByRole('button', { name: 'Más filtros' })
    await userEvent.setup().click(boton)
    const panel = screen.getByRole('dialog', { name: 'Más filtros' })
    expect(within(panel).getByRole('switch', { name: 'Sin actualizar' })).toBeInTheDocument()
    expect(within(panel).getByRole('switch', { name: 'Solucionadas en los últimos 15 días' })).toBeInTheDocument()
    expect(within(panel).getByRole('switch', { name: 'Con comedor' })).toBeInTheDocument()
    expect(within(panel).queryByText('Departamento')).not.toBeInTheDocument()
  })

  it('pone todos los filtros en el panel cuando sólo cabe el botón', async () => {
    anchoContenedor = 130
    renderFiltros()
    dispararResize()
    const boton = screen.getByRole('button', { name: 'Filtros' })
    await userEvent.setup().click(boton)
    const panel = screen.getByRole('dialog', { name: 'Filtros' })
    expect(within(panel).getByText('Departamento')).toBeInTheDocument()
    expect(within(panel).getByText('Asistencia pedagógica')).toBeInTheDocument()
    expect(within(panel).getByRole('switch', { name: 'Sin actualizar' })).toBeInTheDocument()
    expect(within(panel).getByRole('switch', { name: 'Solucionadas en los últimos 15 días' })).toBeInTheDocument()
  })

  it('recalcula al ensanchar el contenedor y muestra contador activo dentro del chip Más filtros', () => {
    anchoContenedor = 500
    const filtros = { ...FILTROS_MAPA_VACIOS, solucionadasRecientes: true }
    const { rerender } = renderFiltros(filtros)
    dispararResize()
    const boton = screen.getByRole('button', { name: 'Más filtros, 1 activos' })
    expect(boton).toHaveClass('filtros-chip', 'filtros-chip--activo')
    expect(boton.querySelector('svg')).toBeNull()
    expect(boton).toHaveTextContent('1')
    anchoContenedor = 2000
    rerender(<FiltrosChips escuelas={padronEjemplo} filtros={filtros} onChange={vi.fn()} />)
    dispararResize()
    expect(screen.queryByRole('button', { name: /Más filtros/ })).not.toBeInTheDocument()
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

  it('ofrece Dirección con los niveles jurisdiccionales presentes, con conteo, y filtra por id numérico', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    anchoContenedor = 1200
    const escuelasConDireccion = [
      escuela({ nivelJurisdiccionalId: 2, nivelJurisdiccionalNombre: 'Secundario' }),
      escuela({ cueAnexo: '1800002-00', nombre: 'Otra', nivelJurisdiccionalId: 2, nivelJurisdiccionalNombre: 'Secundario' }),
      escuela({ cueAnexo: '1800003-00', nombre: 'Sin dirección', nivelJurisdiccionalId: null }),
      escuela({ cueAnexo: '1800004-00', nombre: 'Capital', nivelJurisdiccionalId: 1, nivelJurisdiccionalNombre: 'Capital' }),
    ]
    render(<FiltrosChips escuelas={escuelasConDireccion} filtros={FILTROS_MAPA_VACIOS} onChange={onChange} />)
    dispararResize()

    await user.click(getChip('Dirección'))
    const popover = screen.getByRole('dialog', { name: 'Dirección' })
    expect(within(popover).getAllByRole('checkbox')).toHaveLength(2)
    expect(within(popover).getByRole('checkbox', { name: /Capital.*1/ })).toBeInTheDocument()
    expect(within(popover).getByRole('checkbox', { name: /Secundario.*2/ })).toBeInTheDocument()
    await user.click(within(popover).getByRole('checkbox', { name: /Secundario/ }))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ direcciones: [2] }))
  })

  it('muestra la dirección elegida en el chip y la quita con su ×', () => {
    anchoContenedor = 1200
    const onChange = vi.fn()
    const filtros = { ...FILTROS_MAPA_VACIOS, direcciones: [2] }
    render(<FiltrosChips escuelas={[escuela({ nivelJurisdiccionalId: 2, nivelJurisdiccionalNombre: 'Secundario' })]} filtros={filtros} onChange={onChange} />)
    dispararResize()

    expect(getChip('Dirección: Secundario')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Quitar filtro Dirección' }))
    expect(onChange).toHaveBeenLastCalledWith({ ...filtros, direcciones: [] })
  })

  it('elegir Esquina en Departamento filtra por ese departamento', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderFiltros(FILTROS_MAPA_VACIOS, onChange)

    await user.click(getChip(/Departamento/))
    await user.click(screen.getByRole('checkbox', { name: /Esquina/ }))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ departamentos: ['Esquina'] }))
  })

  it('no cambia el ancho del chip mientras su popover está abierto y muestra la elección al cerrarlo', async () => {
    const user = userEvent.setup()
    render(<FiltrosControlados escuelas={padronEjemplo} onSeleccionar={vi.fn()} />)

    await user.click(getChip('Departamento'))
    await user.click(screen.getByRole('checkbox', { name: /Esquina/ }))
    // The bar is right-aligned, so a wider chip would drag the open list sideways.
    expect(getChip('Departamento')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Quitar filtro Departamento' })).not.toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(getChip('Departamento: Esquina')).toBeInTheDocument()
  })

  it('mantiene los chips en línea mientras un popover está abierto y vuelve a medir al cerrarlo', async () => {
    const user = userEvent.setup()
    anchoContenedor = 1200
    renderFiltros()
    dispararResize()
    const nombresEnLinea = () => within(document.querySelector<HTMLElement>('.filtros-chips-principales')!)
      .getAllByRole('button').map((boton) => boton.textContent?.trim())
    const antes = nombresEnLinea()

    await user.click(getChip('Departamento'))
    // A selection widens the chip; the line must not re-flow under the open popover.
    anchosMedicion.departamentos = 600
    dispararResize()
    expect(nombresEnLinea()).toEqual(antes)
    expect(screen.getByRole('dialog', { name: 'Departamento' })).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(nombresEnLinea()).not.toEqual(antes)
  })

  it('la × de un chip activo limpia sólo ese filtro', async () => {
    const user = userEvent.setup()
    const filtros: FiltrosMapa = { ...FILTROS_MAPA_VACIOS, gravedades: [4], departamentos: ['Goya'] }
    const { onChange } = renderFiltros(filtros, vi.fn())

    await user.click(getChip('Quitar filtro Gravedad'))
    expect(onChange).toHaveBeenLastCalledWith({ ...filtros, gravedades: [] })
  })

  it('Limpiar filtros aparece sólo con algún filtro activo', async () => {
    const { rerender } = renderFiltros()
    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument()

    rerender(<FiltrosChips escuelas={padronEjemplo} filtros={{ ...FILTROS_MAPA_VACIOS, q: 'Goya' }} onChange={() => {}} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Más filtros' }))
    expect(screen.getByRole('button', { name: 'Limpiar filtros' })).toBeInTheDocument()
  })

  it('mantiene Limpiar filtros dentro del panel de filtros', async () => {
    renderFiltros({ ...FILTROS_MAPA_VACIOS, q: 'Goya' })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Más filtros' }))
    const sinActualizar = screen.getByRole('switch', { name: 'Sin actualizar' })
    const limpiar = screen.getByRole('button', { name: 'Limpiar filtros' })
    const contenedor = sinActualizar.closest('.map-filtros-mas-panel')

    expect(contenedor).not.toBeNull()
    expect(contenedor).toContainElement(limpiar)
  })

  it('cada opción muestra cuántas escuelas tiene', async () => {
    const user = userEvent.setup()
    renderFiltros()
    await user.click(getChip(/Departamento/))

    const goya = screen.getByRole('checkbox', { name: /Goya/ })
    expect(goya).toHaveAccessibleName(/Goya.*3/)
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
    await user.click(getChip(/Departamento/))

    const popover = screen.getByRole('dialog', { name: 'Departamento' })
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

  it('Esc cierra el popover y devuelve el foco al chip', async () => {
    const user = userEvent.setup()
    renderFiltros()
    const chip = getChip(/Departamento/)
    await user.click(chip)
    const opcion = within(screen.getByRole('dialog', { name: 'Departamento' })).getAllByRole('checkbox')[0]
    await waitFor(() => expect(opcion).toHaveFocus())

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Departamento' })).not.toBeInTheDocument()
    expect(chip).toHaveFocus()
  })

  it('muestra el valor de un chip activo o la cantidad de opciones elegidas', () => {
    const filtros: FiltrosMapa = { ...FILTROS_MAPA_VACIOS, gravedades: [4], departamentos: ['Goya', 'Esquina'] }
    renderFiltros(filtros)
    expect(getChip(/^Gravedad: /)).toBeInTheDocument()
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

    await user.click(screen.getByRole('button', { name: 'Más filtros' }))
    await user.click(screen.getByRole('switch', { name: 'Sin actualizar' }))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ sinActualizar: true }))
  })

  it('Solucionadas en los últimos 15 días alterna su filtro y permite limpiarlo', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { rerender } = renderFiltros(FILTROS_MAPA_VACIOS, onChange)
    const nombre = 'Solucionadas en los últimos 15 días'
    await user.click(screen.getByRole('button', { name: 'Más filtros' }))
    const interruptor = screen.getByRole('switch', { name: nombre })
    expect(interruptor).toHaveAttribute('aria-checked', 'false')
    await user.click(interruptor)
    expect(onChange).toHaveBeenLastCalledWith({ ...FILTROS_MAPA_VACIOS, solucionadasRecientes: true })

    rerender(<FiltrosChips escuelas={padronEjemplo} filtros={{ ...FILTROS_MAPA_VACIOS, solucionadasRecientes: true }} onChange={onChange} />)
    expect(screen.getByRole('button', { name: 'Más filtros, 1 activos' })).toHaveClass('filtros-chip--activo')
    expect(screen.getByRole('button', { name: 'Limpiar filtros' })).toBeInTheDocument()
    await user.click(screen.getByRole('switch', { name: nombre }))
    expect(onChange).toHaveBeenLastCalledWith(FILTROS_MAPA_VACIOS)
  })

  it('Con comedor alterna su filtro, cuenta como activo y se limpia con Limpiar filtros', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { rerender } = renderFiltros(FILTROS_MAPA_VACIOS, onChange)
    await user.click(screen.getByRole('button', { name: 'Más filtros' }))
    const interruptor = screen.getByRole('switch', { name: 'Con comedor' })
    expect(interruptor).toHaveAttribute('aria-checked', 'false')
    await user.click(interruptor)
    expect(onChange).toHaveBeenLastCalledWith({ ...FILTROS_MAPA_VACIOS, conComedor: true })

    rerender(<FiltrosChips escuelas={padronEjemplo} filtros={{ ...FILTROS_MAPA_VACIOS, conComedor: true }} onChange={onChange} />)
    expect(screen.getByRole('button', { name: 'Más filtros, 1 activos' })).toHaveClass('filtros-chip--activo')
    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }))
    expect(onChange).toHaveBeenLastCalledWith(FILTROS_MAPA_VACIOS)
  })

  it('con ancho de sobra Con comedor se muestra como chip en línea', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    anchoContenedor = 2000
    renderFiltros(FILTROS_MAPA_VACIOS, onChange)
    dispararResize()
    await user.click(getChip('Con comedor'))
    expect(onChange).toHaveBeenLastCalledWith({ ...FILTROS_MAPA_VACIOS, conComedor: true })
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
    const secundario = escuela({ cueAnexo: '1800088-00', nombre: 'Escuela Secundaria Tatacuá', departamento: 'Goya' })
    render(<FiltrosChips escuelas={[primario, secundario]} filtros={{ ...FILTROS_MAPA_VACIOS, departamentos: ['Goya'], q: 'tatacua' }} onChange={vi.fn()} onSeleccionar={vi.fn()} />)
    expect(screen.getByRole('option')).toHaveTextContent('1800088-00')
    expect(screen.queryByText('1800087-00')).not.toBeInTheDocument()
  })

  it('abre y cierra el panel de filtros con Escape o clic fuera', async () => {
    const user = userEvent.setup()
    anchoContenedor = 130
    renderFiltros({ ...FILTROS_MAPA_VACIOS, departamentos: ['Goya'], sinActualizar: true })
    dispararResize()
    const boton = screen.getByRole('button', { name: 'Filtros, 2 activos' })
    await user.click(boton)
    expect(screen.getByRole('dialog', { name: 'Filtros' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Filtros' })).not.toBeInTheDocument()
    await user.click(boton)
    await user.click(document.body)
    expect(screen.queryByRole('dialog', { name: 'Filtros' })).not.toBeInTheDocument()
  })
})
