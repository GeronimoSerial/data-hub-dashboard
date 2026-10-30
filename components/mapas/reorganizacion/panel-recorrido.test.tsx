// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { PanelRecorrido, type PanelRecorridoProps } from './panel-recorrido'
import type { PuntoRecorrido, ResultadoRecorrido } from './use-recorrido'

afterEach(cleanup)

const ORIGEN: PuntoRecorrido = { cue: '1800001', nombre: 'Escuela A', lat: -27.47, lon: -58.83 }
const DESTINO: PuntoRecorrido = { cue: '1800002', nombre: 'Escuela B', lat: -27.5, lon: -58.8 }

const RESULTADO: ResultadoRecorrido = {
  distanciaKm: 12.34,
  duracionMin: 95,
  geometria: { type: 'LineString', coordinates: [[-58.83, -27.47], [-58.8, -27.5]] },
}

const ADVERTENCIA =
  'El tiempo es teórico: no contempla el estado del camino ni el clima, y puede faltar información rural en OpenStreetMap.'

function props(parcial: Partial<PanelRecorridoProps> = {}): PanelRecorridoProps {
  return {
    estado: 'inactivo',
    origen: null,
    destino: null,
    resultado: null,
    error: null,
    onActivar: vi.fn(),
    onDesactivar: vi.fn(),
    onLimpiar: vi.fn(),
    onReintentar: vi.fn(),
    ...parcial,
  }
}

describe('PanelRecorrido', () => {
  it('inactivo ofrece activar la medición y no muestra controles de medición', () => {
    const onActivar = vi.fn()
    render(<PanelRecorrido {...props({ onActivar })} />)

    fireEvent.click(screen.getByRole('button', { name: 'Medir recorrido' }))

    expect(onActivar).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Limpiar' })).toBeNull()
    expect(screen.getByText('Active la medición para elegir un origen y un destino.')).toBeInTheDocument()
  })

  it('activo muestra terminar, limpiar y la instrucción de origen', () => {
    const onDesactivar = vi.fn()
    const onLimpiar = vi.fn()
    render(<PanelRecorrido {...props({ estado: 'eligiendo_origen', onDesactivar, onLimpiar })} />)

    fireEvent.click(screen.getByRole('button', { name: 'Terminar medición' }))
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar' }))

    expect(onDesactivar).toHaveBeenCalledOnce()
    expect(onLimpiar).toHaveBeenCalledOnce()
    expect(screen.getByText('Elija el origen en el mapa o en el listado.')).toBeInTheDocument()
    expect(screen.getAllByText('Sin elegir')).toHaveLength(2)
  })

  it('muestra origen, destino, distancia con un decimal y tiempo en horas y minutos', () => {
    render(<PanelRecorrido {...props({ estado: 'listo', origen: ORIGEN, destino: DESTINO, resultado: RESULTADO })} />)

    expect(screen.getByText('Escuela A')).toBeInTheDocument()
    expect(screen.getByText('Escuela B')).toBeInTheDocument()
    expect(screen.getByText('12,3 km')).toBeInTheDocument()
    expect(screen.getByText('1 h 35 min')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull()
  })

  it('durante la carga indica el cálculo y no muestra distancia', () => {
    render(<PanelRecorrido {...props({ estado: 'cargando', origen: ORIGEN, destino: DESTINO })} />)

    expect(screen.getByText('Calculando el recorrido por camino vial.')).toBeInTheDocument()
    expect(screen.queryByText(/km$/)).toBeNull()
  })

  it('sin ruta vial muestra el mensaje, sin reintento ni distancia', () => {
    const error = { codigo: 'sin_ruta_vial' as const, mensaje: 'No hay un camino vial conectado entre ambos puntos.' }
    render(<PanelRecorrido {...props({ estado: 'error', origen: ORIGEN, destino: DESTINO, error })} />)

    expect(screen.getByText(error.mensaje)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull()
    expect(screen.queryByText(/km$/)).toBeNull()
  })

  it('un error transitorio ofrece reintentar con el mismo par de puntos', () => {
    const onReintentar = vi.fn()
    const error = { codigo: 'tiempo_agotado' as const, mensaje: 'El servicio de recorridos tardó demasiado en responder.' }
    render(
      <PanelRecorrido {...props({ estado: 'error', origen: ORIGEN, destino: DESTINO, error, onReintentar })} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(onReintentar).toHaveBeenCalledOnce()
    expect(screen.getByText(error.mensaje)).toBeInTheDocument()
  })

  it('la advertencia sobre el tiempo teórico siempre está visible', () => {
    const { unmount } = render(<PanelRecorrido {...props()} />)
    expect(screen.getByText(ADVERTENCIA)).toBeInTheDocument()
    unmount()

    render(<PanelRecorrido {...props({ estado: 'listo', origen: ORIGEN, destino: DESTINO, resultado: RESULTADO })} />)
    expect(screen.getByText(ADVERTENCIA)).toBeInTheDocument()
  })

  it('anuncia el estado en una región aria-live', () => {
    const { container } = render(<PanelRecorrido {...props({ estado: 'cargando' })} />)

    expect(container.querySelector('[aria-live="polite"]')).toHaveTextContent('Calculando el recorrido')
  })
})
