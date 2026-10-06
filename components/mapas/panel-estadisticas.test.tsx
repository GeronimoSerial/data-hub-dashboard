// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PanelEstadisticas } from './panel-estadisticas'
import { PanelSituacionActual } from './panel-situacion-actual'
import { filtrarEscuelas } from '@/lib/infraestructura/mapa/filtrar'
import { resumir } from '@/lib/infraestructura/mapa/agregar'
import { FILTROS_MAPA_VACIOS, type EscuelaMapaEnriquecida, type FiltrosMapa } from '@/lib/infraestructura/mapa/tipos'

vi.mock('@/components/infraestructura/evolucion-panel', () => ({
  EvolucionPanel: (props: { filtros: FiltrosMapa }) => (
    <div data-testid="mock-evolucion" data-filtros={JSON.stringify(props.filtros)} />
  ),
}))

const escuelas: EscuelaMapaEnriquecida[] = [
  {
    cueAnexo: '100', nombre: 'Escuela Alta', departamento: 'GENERAL ALVEAR', localidad: 'Centro', lat: null, lon: null,
    niveles: ['Primario', 'Inicial'], alumnos: 80, gravedad: 3, categoriaPrincipal: 'establecimiento',
    clases: 'sin', apoyo: 'virtual', sinActualizar: true, ultimaNovedad: '2026-10-05T12:00:00.000Z', alumnosSinClases: 50,
    situacionesHistoricas: 0, solucionadasRecientes: 1,
  },
  {
    cueAnexo: '200', nombre: 'Escuela Parcial', departamento: 'Bella Vista', localidad: 'Centro', lat: null, lon: null,
    niveles: ['Secundario'], alumnos: 60, gravedad: 3, categoriaPrincipal: 'alumnos',
    clases: 'parcial', apoyo: 'cuadernillo', sinActualizar: false, ultimaNovedad: '2026-10-05T14:00:00.000Z', alumnosSinClases: 10,
    situacionesHistoricas: 0, solucionadasRecientes: 0,
  },
  {
    cueAnexo: '300', nombre: 'Escuela Baja', departamento: 'Goya', localidad: 'Centro', lat: null, lon: null,
    niveles: ['Inicial'], alumnos: 30, gravedad: 1, categoriaPrincipal: 'establecimiento',
    clases: 'evacuado', apoyo: 'no', sinActualizar: false, ultimaNovedad: null, alumnosSinClases: 30,
    situacionesHistoricas: 0, solucionadasRecientes: 0,
  },
  {
    cueAnexo: '400', nombre: 'Escuela sin reporte', departamento: 'Ituzaingó', localidad: 'Centro', lat: null, lon: null,
    niveles: [], alumnos: 20, gravedad: 0, categoriaPrincipal: null,
    clases: 'normal', apoyo: null, sinActualizar: false, ultimaNovedad: null, alumnosSinClases: 0,
    situacionesHistoricas: 0, solucionadasRecientes: 0,
  },
  {
    cueAnexo: '500', nombre: 'Escuela sin dato', departamento: 'Esquina', localidad: 'Centro', lat: null, lon: null,
    niveles: [], alumnos: 20, gravedad: 0, categoriaPrincipal: null,
    clases: 'sin', apoyo: 'sin_dato', sinActualizar: false, ultimaNovedad: null, alumnosSinClases: 20,
    situacionesHistoricas: 0, solucionadasRecientes: 0,
  },
]

function leerNumeroKpi(etiqueta: string, contenedor: HTMLElement): string {
  const texto = within(contenedor).getByText(etiqueta, { selector: '.map-sitact__kpi span' })
  return texto.previousElementSibling?.textContent ?? ''
}

async function elegirAgrupacion(nombre: string) {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: nombre }))
}

describe('PanelEstadisticas', () => {
  afterEach(() => cleanup())

  it('muestra las tarjetas con los números de resumir', () => {
    const resumen = resumir(escuelas)
    const { container } = render(<PanelEstadisticas escuelas={escuelas} filtros={FILTROS_MAPA_VACIOS} />)
    const kpis = container.querySelector<HTMLElement>('.map-est__kpis') ?? container

    expect(leerNumeroKpi('Escuelas con situaciones abiertas', kpis)).toBe('3')
    expect(screen.getByRole('heading', { level: 2, name: 'Estadísticas' })).toBeInTheDocument()
    expect(screen.getByText('Según los filtros activos')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Con situaciones abiertas' })).toBeInTheDocument()
    expect(screen.queryByText('Afectadas', { exact: true })).not.toBeInTheDocument()
    expect(screen.queryByText('Escuelas afectadas', { exact: true })).not.toBeInTheDocument()
    expect(leerNumeroKpi('Sin clases', kpis)).toBe(String(resumen.sinClases))
    expect(leerNumeroKpi('Alumnos sin clases', kpis)).toBe(String(resumen.alumnosSinClases))
    expect(leerNumeroKpi('Sin actualizar', kpis)).toBe(String(resumen.sinActualizar))
    expect(leerNumeroKpi('Sin clases con asistencia pedagógica', kpis)).toBe(`${resumen.sinClasesConApoyo} / ${resumen.sinClases}`)
    expect(within(kpis).getByText(`Sin dato: ${resumen.sinClasesSinDato}`)).toBeInTheDocument()
    expect(leerNumeroKpi('Solucionadas en los últimos 15 días', kpis)).toBe(String(resumen.solucionadasRecientes))
  })

  it('mantiene seis KPI autoajustables y permite envolver sus textos', () => {
    const css = readFileSync('app/globals.css', 'utf8')
    const reglaKpis = css.match(/\.map-est\s+\.map-sitact__kpis\s*\{([^}]*)\}/)?.[1]
    const reglaTexto = css.match(/\.map-est\s+\.map-sitact__kpi\s+span\s*\{([^}]*)\}/)?.[1]
    const { container } = render(<PanelEstadisticas escuelas={escuelas} filtros={FILTROS_MAPA_VACIOS} />)

    expect(container.querySelectorAll('.map-est .map-sitact__kpi')).toHaveLength(6)
    expect(reglaKpis).toMatch(/grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(10\.5rem,\s*1fr\)\)/)
    expect(reglaKpis).not.toMatch(/repeat\(2/)
    expect(reglaTexto).toMatch(/overflow-wrap:\s*anywhere/)
  })

  it('coincide con Situación actual para el mismo padrón filtrado', () => {
    const filtros: FiltrosMapa = { ...FILTROS_MAPA_VACIOS, departamentos: ['GENERAL ALVEAR', 'Bella Vista'], clases: ['sin', 'parcial'] }
    const filtradas = filtrarEscuelas(escuelas, filtros)
    const { container } = render(
      <>
        <PanelSituacionActual escuelas={filtradas} actualizadoEn={null} onSeleccionar={vi.fn()} />
        <PanelEstadisticas escuelas={filtradas} filtros={filtros} />
      </>,
    )
    const situacion = container.querySelector<HTMLElement>('.map-sitact')!
    const estadisticas = container.querySelector<HTMLElement>('.map-est')!

    for (const [etiquetaActual, etiquetaEstadistica] of [
      ['Escuelas con situaciones abiertas', 'Escuelas con situaciones abiertas'],
      ['Sin clases', 'Sin clases'],
      ['Alumnos sin clases', 'Alumnos sin clases'],
      ['Sin actualizar', 'Sin actualizar'],
    ]) {
      expect(leerNumeroKpi(etiquetaEstadistica, estadisticas)).toBe(leerNumeroKpi(etiquetaActual, situacion))
    }
  })

  it('al agrupar por nivel cambia la primera columna y duplica escuelas con varios niveles', async () => {
    const user = userEvent.setup()
    render(<PanelEstadisticas escuelas={escuelas} filtros={FILTROS_MAPA_VACIOS} />)

    expect(screen.getByRole('group', { name: 'Agrupar por' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Departamento|Nivel|Gravedad|Categoría/ })).toHaveLength(4)
    expect(screen.getByRole('button', { name: 'Departamento' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Nivel' }))
    expect(screen.getByRole('button', { name: 'Nivel' })).toHaveAttribute('aria-pressed', 'true')

    const tabla = screen.getByRole('table')
    expect(within(tabla).getAllByRole('columnheader').map((celda) => celda.textContent)).toEqual([
      'Nivel', 'Escuelas', 'Con situaciones abiertas', '%', 'Alumnos sin clases',
    ])
    expect(within(tabla).getByRole('columnheader', { name: 'Nivel' })).toBeInTheDocument()
    expect(within(tabla).getByRole('row', { name: /Primario/ })).toBeInTheDocument()
    expect(within(tabla).getByRole('row', { name: /Inicial/ })).toBeInTheDocument()
    expect(screen.getByText('Una escuela puede tener más de un nivel.')).toBeInTheDocument()
  })

  it('traduce las categorías al agrupar sin exponer sus claves internas', async () => {
    render(<PanelEstadisticas escuelas={escuelas} filtros={FILTROS_MAPA_VACIOS} />)
    await elegirAgrupacion('Categoría')

    const tabla = screen.getByRole('table')
    expect(within(tabla).getByRole('row', { name: /Afecta al establecimiento/ })).toBeInTheDocument()
    expect(within(tabla).getByRole('row', { name: /Inaccesibilidad de alumnos/ })).toBeInTheDocument()
    expect(within(tabla).queryByText('establecimiento', { selector: 'th[scope="row"]' })).not.toBeInTheDocument()
    expect(within(tabla).queryByText('alumnos', { selector: 'th[scope="row"]' })).not.toBeInTheDocument()
    expect(within(tabla).getByRole('row', { name: /Sin categoría/ })).toBeInTheDocument()
  })

  it('muestra estados vacíos sin tabla', async () => {
    const sinNiveles = escuelas.map((escuela) => ({ ...escuela, niveles: [] }))
    const { rerender } = render(<PanelEstadisticas escuelas={sinNiveles} filtros={FILTROS_MAPA_VACIOS} />)
    await elegirAgrupacion('Nivel')
    expect(screen.getByText('No hay niveles cargados en el padrón.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()

    rerender(<PanelEstadisticas escuelas={[]} filtros={FILTROS_MAPA_VACIOS} />)
    expect(screen.getByText('No hay escuelas con estos filtros.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('presenta todas las columnas y renderiza la barra porcentual', () => {
    const { container } = render(<PanelEstadisticas escuelas={escuelas} filtros={FILTROS_MAPA_VACIOS} />)
    const fila = container.querySelector('.map-est__tabla tbody tr')
    expect(fila).not.toBeNull()
    const celdasNumericas = fila?.querySelectorAll('.map-est__numero')
    expect(celdasNumericas).toHaveLength(4)
    expect(fila?.querySelectorAll('th, td')).toHaveLength(5)
    expect([...screen.getByRole('table').querySelectorAll('thead th')].map((celda) => celda.textContent)).toEqual([
      'Departamento', 'Escuelas', 'Con situaciones abiertas', '%', 'Alumnos sin clases',
    ])
    expect(container.querySelector('.map-est__barra')).toBeInTheDocument()
    expect(container.querySelector('.map-est__porcentaje-numero')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Con situaciones abiertas' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Alumnos sin clases' })).toBeInTheDocument()
    expect(screen.getByText('Alumnos sin clases', { selector: '.map-sitact__kpi span' })).toBeInTheDocument()
  })

  it('alinea las columnas numéricas a la derecha y mantiene la primera a la izquierda', () => {
    const css = readFileSync('app/globals.css', 'utf8')
    const reglaNumerica = css.match(/\.ui-table\.map-est__tabla\s+th,\s*\.ui-table\.map-est__tabla\s+td\s*\{([^}]*)\}/)?.[1]
    const reglaPrimeraColumna = css.match(/\.ui-table\.map-est__tabla\s+th:first-child,\s*\.ui-table\.map-est__tabla\s+td:first-child\s*\{([^}]*)\}/)?.[1]

    expect(reglaNumerica).toMatch(/text-align:\s*right/)
    expect(reglaNumerica).toMatch(/font-variant-numeric:\s*tabular-nums/)
    expect(reglaPrimeraColumna).toMatch(/text-align:\s*left/)
  })

  it('mantiene la evolución en una columna con todo el ancho porque muestra una vista a la vez', () => {
    const css = readFileSync('app/globals.css', 'utf8')
    const reglaEvolucion = css.match(/\.map-est__evolucion\s*\{([^}]*)\}/)?.[1]
    const reglaPanel = css.match(/\.map-est__evolucion\s*>\s*\.evolucion-panel\s*\{([^}]*)\}/)?.[1]
    expect(reglaEvolucion).toMatch(/width:\s*100%/)
    expect(reglaPanel).toMatch(/width:\s*100%/)
  })

  it('centra el contenido a 72rem y permite scroll de tabla solo como último recurso', () => {
    const css = readFileSync('app/globals.css', 'utf8')
    const reglaPanel = css.match(/\.map-est\s*\{([^}]*)\}/)?.[1]
    const reglaTabla = css.match(/\.map-est__tabla-wrap\s*\{([^}]*)\}/)?.[1]

    expect(reglaPanel).toMatch(/width:\s*min\(100%,\s*72rem\)/)
    expect(reglaPanel).toMatch(/margin:\s*0 auto/)
    expect(reglaTabla).toMatch(/overflow-x:\s*auto/)
  })

  it('pasa los filtros activos a EvolucionPanel', () => {
    const filtros: FiltrosMapa = { ...FILTROS_MAPA_VACIOS, departamentos: ['Goya'] }
    render(<PanelEstadisticas escuelas={escuelas} filtros={filtros} />)

    expect(screen.getByTestId('mock-evolucion')).toHaveAttribute('data-filtros', JSON.stringify(filtros))
  })
})
