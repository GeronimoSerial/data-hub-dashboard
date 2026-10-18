// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { PanelPlanificacion } from './panel-planificacion'
import type { EscuelaMapaEnriquecida } from '@/lib/infraestructura/mapa/tipos'
import type { TerritorioMapa } from '@/lib/infraestructura/territorio-mapa'
import type { VistaPlanificacion } from '@/lib/infraestructura/mapa/planificacion'

const escuelas: EscuelaMapaEnriquecida[] = [
  { cueAnexo: '1', nombre: 'Escuela Uno', departamento: 'Goya', localidad: 'Centro', lat: null, lon: null, niveles: ['Primario'], alumnos: 20, gravedad: 0, categoriaPrincipal: null, clases: 'normal', apoyo: null, sinActualizar: false, ultimaNovedad: null, alumnosSinClases: 0, situacionesHistoricas: 1, solucionadasRecientes: 0 },
  { cueAnexo: '2', nombre: 'Escuela Dos', departamento: 'Bella Vista', localidad: 'Centro', lat: null, lon: null, niveles: ['Inicial'], alumnos: 40, gravedad: 0, categoriaPrincipal: null, clases: 'normal', apoyo: null, sinActualizar: false, ultimaNovedad: null, alumnosSinClases: 0, situacionesHistoricas: 5, solucionadasRecientes: 0 },
]
const territorio: TerritorioMapa = {
  aislamiento: { fuente: 'OpenStreetMap', atribucion: '© OpenStreetMap contributors', licencia: 'licencia', fechaExtractoOsm: '2026-01-01', versionJob: '1', escuelas: { '1': { nivel: 2, cruces: 0, conPuente: 0, sinPuente: 0, alternativaSinCruce: true }, '2': { nivel: 3, cruces: 1, conPuente: 0, sinPuente: 1, alternativaSinCruce: false } } },
  susceptibilidad: { fuente: 'physrisk', indicador: 'inundacion_fluvial', escenario: 'historico', unidad: 'm', periodoRetornoAnios: 100, fechaCorrida: '2026-01-01', licencia: 'licencia', escuelas: { '1': { inundacionFluvialM: 0.2, claseRio: null, juntoLaguna: null }, '2': { inundacionFluvialM: 0.8, claseRio: null, juntoLaguna: null } } },
}

const riesgo: React.ComponentProps<typeof PanelPlanificacion>['riesgo'] = {
  horizonte: 72,
  disponibles: [24, 72, 240],
  onHorizonte: vi.fn(),
  puntos: [
    { cueAnexo: '1', horizonteHoras: 72, nivelRiesgo: 'alto', nivelAmenaza: 'alto' },
    { cueAnexo: '2', horizonteHoras: 24, nivelRiesgo: 'muy_alto', nivelAmenaza: 'alto' },
  ],
  cargando: false,
  error: null,
}

function props(overrides: Partial<React.ComponentProps<typeof PanelPlanificacion>> = {}) {
  return { vista: 'aisladas' as VistaPlanificacion, onVista: vi.fn(), escuelas, territorio, cargando: false, error: false, onSeleccionar: vi.fn(), riesgo, ...overrides }
}

describe('PanelPlanificacion', () => {
  afterEach(cleanup)

  it('muestra prioridad ordenada y solo escuelas con nivel para la vista', () => {
    render(<PanelPlanificacion {...props()} />)
    const filas = screen.getAllByRole('button').filter((boton) => boton.className.includes('map-sitact__fila'))
    expect(filas.map((fila) => fila.getAttribute('aria-label'))).toEqual(['Escuela Dos, Bella Vista', 'Escuela Uno, Goya'])
    expect(filas[0]).toHaveTextContent('Alto')
    expect(filas[1]).toHaveTextContent('Goya · Primario')
  })

  it('cambia la vista y la lista, y notifica la selección de escuela', () => {
    const onVista = vi.fn()
    const onSeleccionar = vi.fn()
    const { rerender } = render(<PanelPlanificacion {...props({ onVista, onSeleccionar })} />)
    expect(screen.queryByRole('button', { name: 'Inundación' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Riesgo hoy' }))
    expect(onVista).toHaveBeenCalledWith('riesgo')
    rerender(<PanelPlanificacion {...props({ vista: 'historial', onVista, onSeleccionar })} />)
    const filas = screen.getAllByRole('button').filter((boton) => boton.className.includes('map-sitact__fila'))
    expect(filas.map((fila) => fila.getAttribute('aria-label'))).toEqual(['Escuela Dos, Bella Vista', 'Escuela Uno, Goya'])
    fireEvent.click(screen.getByRole('button', { name: 'Escuela Dos, Bella Vista' }))
    expect(onSeleccionar).toHaveBeenCalledWith('2')
  })

  it('muestra estados de carga, error, sin datos de vista y sin escuelas prioritarias', () => {
    const carga = render(<PanelPlanificacion {...props({ cargando: true })} />)
    expect(screen.getByRole('status')).toHaveTextContent('Cargando datos…')
    carga.unmount()
    const fallo = render(<PanelPlanificacion {...props({ error: true })} />)
    expect(screen.getByRole('status')).toHaveTextContent('No se pudieron cargar los datos de esta vista. Intente de nuevo más tarde.')
    fallo.unmount()
    const sinDatos = render(<PanelPlanificacion {...props({ territorio: { ...territorio, aislamiento: null } })} />)
    expect(screen.getByText('Todavía no hay datos para esta vista.')).toBeInTheDocument()
    sinDatos.unmount()
    render(<PanelPlanificacion {...props({ escuelas: [] })} />)
    expect(screen.getByText('Ninguna escuela con prioridad para estos filtros.')).toBeInTheDocument()
  })

  it('en Riesgo hoy muestra el horizonte y las escuelas en riesgo del motor', () => {
    const onHorizonte = vi.fn()
    render(<PanelPlanificacion {...props({ vista: 'riesgo', territorio: null, riesgo: { ...riesgo, onHorizonte } })} />)
    expect(screen.getByText('Escuelas en riesgo')).toBeInTheDocument()
    const filas = screen.getAllByRole('button').filter((boton) => boton.className.includes('map-sitact__fila'))
    expect(filas.map((fila) => fila.getAttribute('aria-label'))).toEqual(['Escuela Uno, Goya'])
    fireEvent.click(screen.getByRole('button', { name: '24 h' }))
    expect(onHorizonte).toHaveBeenCalledWith(24)
    expect(screen.queryByText('Cargando datos…')).not.toBeInTheDocument()
  })

  it('en Riesgo hoy muestra carga y error del motor', () => {
    const carga = render(<PanelPlanificacion {...props({ vista: 'riesgo', riesgo: { ...riesgo, puntos: null, cargando: true } })} />)
    expect(screen.getByRole('status')).toHaveTextContent('Calculando riesgo…')
    carga.unmount()
    render(<PanelPlanificacion {...props({ vista: 'riesgo', riesgo: { ...riesgo, error: 'fallo' } })} />)
    expect(screen.getByRole('status')).toHaveTextContent('No se pudo cargar el pronóstico')
  })

  it('en Historial sin situaciones explica que todavía no hay registros', () => {
    render(<PanelPlanificacion {...props({ vista: 'historial', escuelas: escuelas.map((escuela) => ({ ...escuela, situacionesHistoricas: 0 })) })} />)
    expect(screen.getByText('Todavía no hay situaciones registradas para estos filtros.')).toBeInTheDocument()
    expect(screen.queryByText('Ninguna escuela con prioridad para estos filtros.')).not.toBeInTheDocument()
  })

  it('no muestra estados del territorio en historial ni textos técnicos', () => {
    const { container } = render(<PanelPlanificacion {...props({ vista: 'historial', territorio: null, cargando: true, error: true })} />)
    expect(screen.queryByText('Cargando datos…')).not.toBeInTheDocument()
    expect(container.textContent).not.toMatch(/fuente|OpenStreetMap|OSM|extracto|per[ií]odo de retorno|metodolog|modelo/i)
  })
})
