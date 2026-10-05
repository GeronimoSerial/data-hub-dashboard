// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { PanelEstadisticas } from './panel-estadisticas'
import { PanelSituacionActual } from './panel-situacion-actual'
import { filtrarEscuelas } from '@/lib/infraestructura/mapa/filtrar'
import { resumir } from '@/lib/infraestructura/mapa/agregar'
import { FILTROS_MAPA_VACIOS, type EscuelaMapaEnriquecida, type FiltrosMapa } from '@/lib/infraestructura/mapa/tipos'

vi.mock('@/components/infraestructura/evolucion-panel', () => ({
  EvolucionPanel: () => <div data-testid="mock-evolucion" />,
}))

const escuelas: EscuelaMapaEnriquecida[] = [
  {
    cueAnexo: '100', nombre: 'Escuela Alta', departamento: 'GENERAL ALVEAR', localidad: 'Centro', lat: null, lon: null,
    niveles: ['Primario', 'Inicial'], alumnos: 80, gravedad: 3, categoriaPrincipal: 'Anegamiento',
    clases: 'sin', apoyo: 'virtual', sinActualizar: true, ultimaNovedad: '2026-10-05T12:00:00.000Z', alumnosSinClases: 50,
    situacionesHistoricas: 0,
  },
  {
    cueAnexo: '200', nombre: 'Escuela Parcial', departamento: 'Bella Vista', localidad: 'Centro', lat: null, lon: null,
    niveles: ['Secundario'], alumnos: 60, gravedad: 3, categoriaPrincipal: 'Camino',
    clases: 'parcial', apoyo: 'cuadernillo', sinActualizar: false, ultimaNovedad: '2026-10-05T14:00:00.000Z', alumnosSinClases: 10,
    situacionesHistoricas: 0,
  },
  {
    cueAnexo: '300', nombre: 'Escuela Baja', departamento: 'Goya', localidad: 'Centro', lat: null, lon: null,
    niveles: ['Inicial'], alumnos: 30, gravedad: 1, categoriaPrincipal: 'Otro',
    clases: 'evacuado', apoyo: 'no', sinActualizar: false, ultimaNovedad: null, alumnosSinClases: 30,
    situacionesHistoricas: 0,
  },
  {
    cueAnexo: '400', nombre: 'Escuela sin reporte', departamento: 'Ituzaingó', localidad: 'Centro', lat: null, lon: null,
    niveles: [], alumnos: 20, gravedad: 0, categoriaPrincipal: null,
    clases: 'normal', apoyo: null, sinActualizar: false, ultimaNovedad: null, alumnosSinClases: 0,
    situacionesHistoricas: 0,
  },
]

function leerNumeroKpi(etiqueta: string, contenedor: HTMLElement): string {
  const texto = within(contenedor).getByText(etiqueta, { selector: '.map-sitact__kpi span' })
  return texto.previousElementSibling?.textContent ?? ''
}

describe('PanelEstadisticas', () => {
  afterEach(() => cleanup())

  it('muestra las cinco tarjetas con los números de resumir', () => {
    const resumen = resumir(escuelas)
    const { container } = render(<PanelEstadisticas escuelas={escuelas} />)
    const kpis = container.querySelector<HTMLElement>('.map-est__kpis') ?? container

    expect(leerNumeroKpi('Escuelas afectadas', kpis)).toBe('3')
    expect(leerNumeroKpi('Sin clases', kpis)).toBe(String(resumen.sinClases))
    expect(leerNumeroKpi('Alumnos sin clases', kpis)).toBe(String(resumen.alumnosSinClases))
    expect(leerNumeroKpi('Sin actualizar', kpis)).toBe(String(resumen.sinActualizar))
    expect(leerNumeroKpi('Sin clases con apoyo pedagógico', kpis)).toBe(`${resumen.sinClasesConApoyo} / ${resumen.sinClases}`)
  })

  it('coincide con Situación actual para el mismo padrón filtrado', () => {
    const filtros: FiltrosMapa = { ...FILTROS_MAPA_VACIOS, departamentos: ['GENERAL ALVEAR', 'Bella Vista'], clases: ['sin', 'parcial'] }
    const filtradas = filtrarEscuelas(escuelas, filtros)
    const { container } = render(
      <>
        <PanelSituacionActual escuelas={filtradas} actualizadoEn={null} onSeleccionar={vi.fn()} />
        <PanelEstadisticas escuelas={filtradas} />
      </>,
    )
    const situacion = container.querySelector<HTMLElement>('.map-sitact')!
    const estadisticas = container.querySelector<HTMLElement>('.map-est')!

    for (const [etiquetaActual, etiquetaEstadistica] of [
      ['Escuelas con reporte', 'Escuelas afectadas'],
      ['Sin clases', 'Sin clases'],
      ['Alumnos sin clases', 'Alumnos sin clases'],
      ['Sin actualizar', 'Sin actualizar'],
    ]) {
      expect(leerNumeroKpi(etiquetaEstadistica, estadisticas)).toBe(leerNumeroKpi(etiquetaActual, situacion))
    }
  })

  it('al agrupar por nivel cambia la primera columna y duplica escuelas con varios niveles', () => {
    render(<PanelEstadisticas escuelas={escuelas} />)

    expect(screen.getByRole('button', { name: 'Departamento' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Nivel' }))
    expect(screen.getByRole('button', { name: 'Nivel' })).toHaveAttribute('aria-pressed', 'true')

    const tabla = screen.getByRole('table')
    expect(within(tabla).getByRole('columnheader', { name: 'Nivel' })).toBeInTheDocument()
    expect(within(tabla).getByRole('row', { name: /Primario/ })).toBeInTheDocument()
    expect(within(tabla).getByRole('row', { name: /Inicial/ })).toBeInTheDocument()
    expect(screen.getByText('Una escuela puede tener más de un nivel.')).toBeInTheDocument()
  })

  it('muestra estados vacíos sin tabla', () => {
    const sinNiveles = escuelas.map((escuela) => ({ ...escuela, niveles: [] }))
    const { rerender } = render(<PanelEstadisticas escuelas={sinNiveles} />)
    fireEvent.click(screen.getByRole('button', { name: 'Nivel' }))
    expect(screen.getByText('No hay niveles cargados en el padrón.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()

    rerender(<PanelEstadisticas escuelas={[]} />)
    expect(screen.getByText('No hay escuelas con estos filtros.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('presenta celdas numéricas y una barra porcentual del ancho indicado', () => {
    const { container } = render(<PanelEstadisticas escuelas={escuelas} />)
    const fila = container.querySelector('.map-est__tabla tbody tr')
    expect(fila).not.toBeNull()
    const celdasNumericas = fila?.querySelectorAll('.map-est__numero')
    expect(celdasNumericas).toHaveLength(4)
    const barra = fila?.querySelector<HTMLElement>('.map-est__barra span')
    expect(barra?.style.width).toBe('100%')
    expect(barra?.parentElement).toHaveAttribute('aria-hidden', 'true')
  })
})
