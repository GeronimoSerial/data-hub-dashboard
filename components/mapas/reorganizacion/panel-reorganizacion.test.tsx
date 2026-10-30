// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FILTROS_INICIALES, SIN_DATO_CLASIFICACION, opcionesFiltro, type FiltrosReorganizacion } from '@/lib/reorganizacion/filtros'
import type { EscuelaV29 } from '@/lib/reorganizacion/tipos'
import { PanelReorganizacion, type PanelReorganizacionProps } from './panel-reorganizacion'

afterEach(cleanup)

function escuela(overrides: Partial<EscuelaV29> & Pick<EscuelaV29, 'cue' | 'nombre'>): EscuelaV29 {
  return {
    departamento: 'Goya',
    localidad: 'Goya',
    ambito: 'Urbano',
    cui: '',
    jurisdiccion: 'Provincial',
    modalidad: 'Común',
    matricula: 100,
    historia: {},
    lat: -29.1,
    lon: -59.2,
    pof: {},
    agentes: 0,
    zona: 'Zona 1',
    sueldosTotal: 1000,
    personasSueldos: 10,
    clasificacionZonaSueldos: 'A',
    ...overrides,
  }
}

const ESCUELAS: EscuelaV29[] = [
  escuela({ cue: '1001', nombre: 'Escuela Uno', matricula: 300, agentes: 2 }),
  escuela({ cue: '1002', nombre: 'Escuela Dos', departamento: 'Bella Vista', localidad: 'Bella Vista', zona: 'Aislado', clasificacionZonaSueldos: SIN_DATO_CLASIFICACION, matricula: 550 }),
]

function renderPanel(overrides: Partial<PanelReorganizacionProps> = {}) {
  const props: PanelReorganizacionProps = {
    escuelasFiltradas: ESCUELAS,
    totalEscuelas: ESCUELAS.length,
    filtros: FILTROS_INICIALES,
    onFiltros: vi.fn(),
    opciones: opcionesFiltro(ESCUELAS),
    indicadores: { establecimientos: 2, alumnos: 850, ubicados: 2, conPof: 1 },
    clasificacion: '',
    onClasificacion: vi.fn(),
    cantidadResaltadas: 0,
    seleccionada: null,
    onSeleccionarEscuela: vi.fn(),
    plegado: false,
    onPlegado: vi.fn(),
    ...overrides,
  }
  render(<PanelReorganizacion {...props} />)
  return props
}

describe('PanelReorganizacion · indicadores', () => {
  it('muestra los cuatro indicadores del listado filtrado', () => {
    renderPanel()

    const grupo = screen.getByRole('group', { name: 'Indicadores' })
    expect(within(grupo).getByText('Establecimientos filtrados')).toBeTruthy()
    expect(within(grupo).getByText('850')).toBeTruthy()
    expect(within(grupo).getByText('Ubicados en el mapa')).toBeTruthy()
    expect(within(grupo).getByText('Con POF identificada')).toBeTruthy()
  })
})

describe('PanelReorganizacion · filtros', () => {
  it('llama a onFiltros con la búsqueda escrita', async () => {
    const props = renderPanel()

    await userEvent.type(screen.getByLabelText('Buscar'), 'G')
    expect(props.onFiltros).toHaveBeenCalledWith({ ...FILTROS_INICIALES, busqueda: 'G' })
  })

  it('deshabilita "Limpiar filtros" sin filtros activos', () => {
    renderPanel()

    expect(screen.getByRole('button', { name: 'Limpiar filtros' })).toBeDisabled()
  })

  it('limpia todos los filtros con "Limpiar filtros"', async () => {
    const activos: FiltrosReorganizacion = { ...FILTROS_INICIALES, busqueda: 'Goya', departamento: 'Goya', pof: 'si' }
    const props = renderPanel({ filtros: activos })

    await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }))
    expect(props.onFiltros).toHaveBeenCalledWith(FILTROS_INICIALES)
  })
})

describe('PanelReorganizacion · listado y selección', () => {
  it('muestra el contador de resultados', () => {
    renderPanel()

    expect(screen.getByText('Mostrando 2 de 2 establecimientos')).toBeTruthy()
  })

  it('limita las filas renderizadas a 200 y lo informa', () => {
    const muchas = Array.from({ length: 205 }, (_, i) => escuela({ cue: `CUE${i}`, nombre: `Escuela ${i}` }))
    renderPanel({ escuelasFiltradas: muchas, totalEscuelas: 205, indicadores: { establecimientos: 205, alumnos: 0, ubicados: 205, conPof: 0 } })

    expect(screen.getByText(/Mostrando 200 de 205 establecimientos/)).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /Escuela \d+/ })).toHaveLength(200)
  })

  it('selecciona una escuela al pulsar su fila', async () => {
    const props = renderPanel()

    await userEvent.click(screen.getByRole('button', { name: /Escuela Uno/ }))
    expect(props.onSeleccionarEscuela).toHaveBeenCalledWith('1001')
  })

  it('marca como actual la fila de la escuela seleccionada', () => {
    renderPanel({ seleccionada: '1002' })

    expect(screen.getByRole('button', { name: /Escuela Dos/ })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('button', { name: /Escuela Uno/ })).not.toHaveAttribute('aria-current')
  })

  it('muestra el estado vacío cuando no hay coincidencias', () => {
    renderPanel({ escuelasFiltradas: [], indicadores: { establecimientos: 0, alumnos: 0, ubicados: 0, conPof: 0 } })

    expect(screen.getByText('Sin coincidencias')).toBeTruthy()
    expect(screen.getByText(/^Mostrando 0 de 0 establecimientos/)).toBeTruthy()
    expect(screen.queryByRole('list', { name: 'Establecimientos filtrados' })).toBeNull()
  })
})

describe('PanelReorganizacion · plegado', () => {
  it('pliega el panel al pulsar "Ocultar panel"', async () => {
    const props = renderPanel()

    await userEvent.click(screen.getByRole('button', { name: 'Ocultar panel' }))
    expect(props.onPlegado).toHaveBeenCalledWith(true)
  })

  it('despliega el panel al pulsar "Mostrar panel" cuando está plegado', async () => {
    const props = renderPanel({ plegado: true })

    const boton = screen.getByRole('button', { name: 'Mostrar panel' })
    expect(boton).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(boton)
    expect(props.onPlegado).toHaveBeenCalledWith(false)
  })
})

describe('PanelReorganizacion · resaltado por clasificación', () => {
  it('cambia la clasificación resaltada desde el selector', async () => {
    const props = renderPanel()

    await userEvent.click(screen.getByRole('combobox', { name: 'Resaltar clasificación salarial' }))
    const opciones = await screen.findAllByRole('option', { name: 'Sin dato de clasificación' })
    expect(opciones.length).toBeGreaterThan(0)
    await userEvent.click(opciones[opciones.length - 1])
    expect(props.onClasificacion).toHaveBeenCalledWith(SIN_DATO_CLASIFICACION)
  })

  it('informa cuántas filas quedan resaltadas cuando hay clasificación activa', () => {
    renderPanel({ clasificacion: 'A', cantidadResaltadas: 1 })

    expect(screen.getByText('1 resaltadas en el listado')).toBeTruthy()
  })

  it('no muestra contador de resaltado sin clasificación', () => {
    renderPanel()

    expect(screen.queryByText(/resaltadas en el listado/)).toBeNull()
  })
})
