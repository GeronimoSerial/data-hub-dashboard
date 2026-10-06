// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { PanelRadar } from './panel-radar'
import type { EscuelaMapaEnriquecida } from '@/lib/infraestructura/mapa/tipos'
import type { HorizonteMotor } from '@/lib/infraestructura/mapa/radar'
import type { VariableRadarUI } from './radar-meteo/selector'

const escuelas: EscuelaMapaEnriquecida[] = [
  {
    cueAnexo: '100', nombre: 'Escuela Moderada', departamento: 'GENERAL ALVEAR', localidad: 'Centro', lat: null, lon: null,
    niveles: ['Primario', 'Inicial'], alumnos: 80, gravedad: 0, categoriaPrincipal: null,
    clases: 'normal', apoyo: null, sinActualizar: false, ultimaNovedad: null, alumnosSinClases: 0,
    situacionesHistoricas: 0, solucionadasRecientes: 0,
  },
  {
    cueAnexo: '200', nombre: 'Escuela Alta', departamento: 'Bella Vista', localidad: 'Centro', lat: null, lon: null,
    niveles: ['Secundario'], alumnos: 60, gravedad: 0, categoriaPrincipal: null,
    clases: 'normal', apoyo: null, sinActualizar: false, ultimaNovedad: null, alumnosSinClases: 0,
    situacionesHistoricas: 0, solucionadasRecientes: 0,
  },
  {
    cueAnexo: '300', nombre: 'Escuela Muy Alta', departamento: 'Goya', localidad: 'Centro', lat: null, lon: null,
    niveles: ['Inicial'], alumnos: 30, gravedad: 0, categoriaPrincipal: null,
    clases: 'normal', apoyo: null, sinActualizar: false, ultimaNovedad: null, alumnosSinClases: 0,
    situacionesHistoricas: 0, solucionadasRecientes: 0,
  },
  {
    cueAnexo: '400', nombre: 'Escuela Baja', departamento: 'Ituzaingó', localidad: 'Centro', lat: null, lon: null,
    niveles: ['Primario'], alumnos: 20, gravedad: 0, categoriaPrincipal: null,
    clases: 'normal', apoyo: null, sinActualizar: false, ultimaNovedad: null, alumnosSinClases: 0,
    situacionesHistoricas: 0, solucionadasRecientes: 0,
  },
]

const puntos = [
  { cueAnexo: '100', horizonteHoras: 72, nivelRiesgo: 'moderado' },
  { cueAnexo: '200', horizonteHoras: 72, nivelRiesgo: 'alto' },
  { cueAnexo: '300', horizonteHoras: 72, nivelRiesgo: 'muy_alto' },
  { cueAnexo: '400', horizonteHoras: 72, nivelRiesgo: 'bajo' },
  { cueAnexo: '100', horizonteHoras: 24, nivelRiesgo: 'alto' },
  { cueAnexo: '200', horizonteHoras: 24, nivelRiesgo: 'moderado' },
  { cueAnexo: '300', horizonteHoras: 24, nivelRiesgo: 'bajo' },
  { cueAnexo: '400', horizonteHoras: 24, nivelRiesgo: 'muy_alto' },
]

function props(overrides: Partial<React.ComponentProps<typeof PanelRadar>> = {}) {
  return {
    horizonte: 72 as HorizonteMotor,
    disponibles: [24, 72] as HorizonteMotor[],
    onHorizonte: vi.fn(),
    variable: 'lluvia' as VariableRadarUI,
    onVariable: vi.fn(),
    puntos,
    escuelas,
    cargando: false,
    error: null,
    onSeleccionar: vi.fn(),
    ...overrides,
  }
}

describe('PanelRadar', () => {
  afterEach(cleanup)

  it('muestra los números del horizonte actual y ordena las escuelas por nivel', () => {
    render(<PanelRadar {...props()} />)

    expect(screen.getByTestId('panel-radar')).toBeInTheDocument()
    expect(screen.getByText('Riesgo alto o muy alto').previousElementSibling).toHaveTextContent('2')
    expect(screen.getByText('Alumnos en esas escuelas').previousElementSibling).toHaveTextContent('90')
    const filas = screen.getAllByRole('button', { name: /Escuela/ }).filter((boton) => boton.className.includes('map-sitact__fila'))
    expect(filas.map((fila) => fila.getAttribute('aria-label'))).toEqual([
      'Escuela Muy Alta, Goya',
      'Escuela Alta, Bella Vista',
      'Escuela Moderada, General Alvear',
    ])
    expect(within(filas[2]).getByText('General Alvear · Primario, Inicial')).toBeInTheDocument()
    expect(screen.queryByText('Escuela Baja')).not.toBeInTheDocument()
    expect(screen.getAllByText('Escuela Moderada')).toHaveLength(1)
  })

  it('actualiza números y lista cuando cambia el horizonte', () => {
    const { rerender } = render(<PanelRadar {...props()} />)
    rerender(<PanelRadar {...props({ horizonte: 24 })} />)

    expect(screen.getByText('Riesgo alto o muy alto').previousElementSibling).toHaveTextContent('2')
    expect(screen.getByText('Alumnos en esas escuelas').previousElementSibling).toHaveTextContent('100')
    const filas = screen.getAllByRole('button').filter((boton) => boton.className.includes('map-sitact__fila'))
    expect(filas.map((fila) => fila.getAttribute('aria-label'))).toEqual([
      'Escuela Baja, Ituzaingó',
      'Escuela Moderada, General Alvear',
      'Escuela Alta, Bella Vista',
    ])
  })

  it('permite elegir un horizonte disponible y conserva deshabilitado el que no tiene datos', () => {
    const onHorizonte = vi.fn()
    render(<PanelRadar {...props({ onHorizonte })} />)

    fireEvent.click(screen.getByRole('button', { name: '24 h' }))
    fireEvent.click(screen.getByRole('button', { name: '10 días' }))

    expect(onHorizonte).toHaveBeenCalledTimes(1)
    expect(onHorizonte).toHaveBeenCalledWith(24)
    expect(screen.getByRole('button', { name: '10 días' })).toHaveAttribute('aria-disabled', 'true')
  })

  it('muestra la variable meteorológica en un control segmentado y permite elegir viento', () => {
    const onVariable = vi.fn()
    render(<PanelRadar {...props({ onVariable })} />)

    const grupo = screen.getByRole('group', { name: 'Variable meteorológica' })
    expect(within(grupo).getAllByRole('button')).toHaveLength(4)
    expect(within(grupo).getByRole('button', { name: 'Lluvia' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(grupo).getByRole('button', { name: 'Probabilidad' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(grupo).getByRole('button', { name: 'Viento' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(grupo).getByRole('button', { name: 'Granizo' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(grupo).queryByRole('button', { name: /\(mm\)|\(estimado\)/ })).not.toBeInTheDocument()
    expect(grupo).toHaveClass('map-seg--2')

    fireEvent.click(within(grupo).getByRole('button', { name: 'Viento' }))
    expect(onVariable).toHaveBeenCalledWith('viento')
  })

  it('selecciona una escuela al activar su renglón', () => {
    const onSeleccionar = vi.fn()
    render(<PanelRadar {...props({ onSeleccionar })} />)

    fireEvent.click(screen.getByRole('button', { name: 'Escuela Alta, Bella Vista' }))

    expect(onSeleccionar).toHaveBeenCalledWith('200')
  })

  it('muestra los estados de carga, error, ausencia de pronóstico y ausencia de escuelas en riesgo', () => {
    const cargando = render(<PanelRadar {...props({ cargando: true })} />)
    expect(screen.getByRole('status')).toHaveTextContent('Cargando pronóstico…')
    expect(screen.queryByText('Riesgo alto o muy alto')).not.toBeInTheDocument()
    cargando.unmount()

    const error = render(<PanelRadar {...props({ error: 'falló' })} />)
    expect(screen.getByRole('status')).toHaveTextContent('No se pudo cargar el pronóstico. Intente de nuevo más tarde.')
    error.unmount()

    const sinPronostico = render(<PanelRadar {...props({ disponibles: [] })} />)
    expect(screen.getByText('Todavía no hay un pronóstico disponible. Vuelva a consultar más tarde.')).toBeInTheDocument()
    expect(screen.queryByText('Riesgo alto o muy alto')).not.toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Horizonte' })).getAllByRole('button').every((boton) => boton.getAttribute('aria-disabled') === 'true')).toBe(true)
    sinPronostico.unmount()

    render(<PanelRadar {...props({ puntos: [] })} />)
    expect(screen.getByText('Riesgo alto o muy alto').previousElementSibling).toHaveTextContent('0')
    expect(screen.getByText('Ninguna escuela en riesgo para estos filtros.')).toBeInTheDocument()
  })

  it('no incluye textos técnicos ni repite escuelas con varios niveles educativos', () => {
    const { container } = render(<PanelRadar {...props()} />)

    expect(container.textContent).not.toMatch(/lluvia observada|fuente|corrida|ensamble|modelo|metodolog|extracto/i)
    expect(screen.getAllByText('Escuela Moderada')).toHaveLength(1)
  })
})
