// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { PanelRadar } from './panel-radar'
import type { EscuelaMapaEnriquecida } from '@/lib/infraestructura/mapa/tipos'
import type { HorizonteMotor } from '@/lib/infraestructura/mapa/radar'
import type { VariableRadarUI } from './radar-meteo/selector'
import type { ResumenRadarMeteo } from '@/lib/infraestructura/radar-meteo/use-resumen-radar-meteo'

function resumenMeteo(): ResumenRadarMeteo {
  const dia = (lluvia24h: number) => ({ fecha: '2026-10-06', lluvia24h, lluviaLocalMax: lluvia24h, rafagaMaxKmh: 25, picoHora: null, tormenta: false, granizoMax: null, cobertura: 100, resaltado: { lluvia: null, rafaga: null }, ensamble: null })
  return {
    runId: 'test-run', runAt: '2026-10-06T12:00:00Z', sinDatos: false, frescura: null, dias: ['2026-10-06', '2026-10-07'], alertasSmn: [],
    departamentos: [
      { id: 'goya', nombre: 'Goya', dias: [dia(12), dia(20)], proximas48h: [] },
      { id: 'bella-vista', nombre: 'Bella Vista', dias: [dia(30), dia(40)], proximas48h: [] },
      { id: 'alv', nombre: 'General Alvear', dias: [dia(0), dia(0)], proximas48h: [] },
    ],
  }
}

const pronosticoVacio = { resumen: null, cargando: false, error: false, departamentoId: null, onDepartamento: vi.fn() }

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
    alertas: { grupos: [], cargando: false, error: false, claveSeleccionada: null, onSeleccionar: vi.fn() },
    pronostico: pronosticoVacio,
    ...overrides,
  }
}

describe('PanelRadar', () => {
  afterEach(cleanup)

  it('muestra los números del horizonte actual y ordena las escuelas por nivel', () => {
    render(<PanelRadar {...props()} />)

    expect(screen.getByTestId('panel-radar')).toBeInTheDocument()
    expect(screen.getByText('Escuelas en riesgo').previousElementSibling).toHaveTextContent('3')
    expect(screen.getByText('Alumnos en esas escuelas').previousElementSibling).toHaveTextContent('170')
    expect(screen.getByText('1 muy alto · 1 alto · 1 moderado')).toBeInTheDocument()
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

  it('muestra la amenaza junto a la prioridad educativa, sin mezclarlas', () => {
    const conAmenaza = puntos.map((punto) =>
      punto.cueAnexo === '100' && punto.horizonteHoras === 72
        ? { ...punto, nivelAmenaza: 'muy_alto' }
        : punto.cueAnexo === '200' && punto.horizonteHoras === 72
          ? { ...punto, nivelAmenaza: null }
          : punto,
    )
    render(<PanelRadar {...props({ puntos: conAmenaza })} />)

    const moderada = screen.getByRole('button', { name: 'Escuela Moderada, General Alvear' })
    expect(within(moderada).getByText('Riesgo actual: Moderado')).toBeInTheDocument()
    expect(within(moderada).getByText('Amenaza: Muy alto')).toBeInTheDocument()

    // Sin dato de amenaza no se inventa un nivel: sólo queda la prioridad.
    const alta = screen.getByRole('button', { name: 'Escuela Alta, Bella Vista' })
    expect(within(alta).getByText('Riesgo actual: Alto')).toBeInTheDocument()
    expect(within(alta).queryByText(/Amenaza/)).not.toBeInTheDocument()
  })

  it('lista una escuela de prioridad baja cuando su amenaza es alta o muy alta, al final y sin sumarla a los KPIs', () => {
    const conAmenaza = puntos.map((punto) =>
      punto.cueAnexo === '400' && punto.horizonteHoras === 72
        ? { ...punto, nivelAmenaza: 'alto' }
        : punto.cueAnexo === '100' && punto.horizonteHoras === 72
          ? { ...punto, nivelAmenaza: 'bajo' }
          : punto,
    )
    render(<PanelRadar {...props({ puntos: conAmenaza })} />)
    fireEvent.click(screen.getByRole('button', { name: /Ver más/ }))

    const filas = screen.getAllByRole('button', { name: /Escuela/ }).filter((boton) => boton.className.includes('map-sitact__fila'))
    expect(filas.map((fila) => fila.getAttribute('aria-label'))).toEqual([
      'Escuela Muy Alta, Goya',
      'Escuela Alta, Bella Vista',
      'Escuela Moderada, General Alvear',
      'Escuela Baja, Ituzaingó',
    ])
    expect(within(filas[3]).getByText('Riesgo actual: Bajo')).toBeInTheDocument()
    expect(within(filas[3]).getByText('Amenaza: Alto')).toBeInTheDocument()
    // Los KPIs cuentan la prioridad educativa desde moderado; la amenaza sola no suma.
    expect(screen.getByText('Escuelas en riesgo').previousElementSibling).toHaveTextContent('3')
  })

  it('no lista una escuela de prioridad baja con amenaza moderada o sin dato', () => {
    const conAmenaza = puntos.map((punto) =>
      punto.cueAnexo === '400' && punto.horizonteHoras === 72 ? { ...punto, nivelAmenaza: 'moderado' } : punto,
    )
    render(<PanelRadar {...props({ puntos: conAmenaza })} />)

    expect(screen.queryByText('Escuela Baja')).not.toBeInTheDocument()
  })

  it('actualiza números y lista cuando cambia el horizonte', () => {
    const { rerender } = render(<PanelRadar {...props()} />)
    rerender(<PanelRadar {...props({ horizonte: 24 })} />)

    expect(screen.getByText('Escuelas en riesgo').previousElementSibling).toHaveTextContent('3')
    expect(screen.getByText('Alumnos en esas escuelas').previousElementSibling).toHaveTextContent('160')
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
    expect(within(grupo).getByRole('button', { name: 'Lluvia (mm)' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(grupo).getByRole('button', { name: 'Lluvia (prob)' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(grupo).getByRole('button', { name: 'Viento' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(grupo).getByRole('button', { name: 'Granizo' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(grupo).queryByRole('button', { name: /\(estimado\)/ })).not.toBeInTheDocument()
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
    const cargando = render(<PanelRadar {...props({ cargando: true, disponibles: [] })} />)
    // Mientras carga el motor se reserva su lugar: el bloque no aparece tarde.
    const reservado = screen.getByRole('region', { name: 'Riesgo calculado (probabilístico)' })
    expect(within(reservado).getByRole('status')).toHaveTextContent('Calculando riesgo…')
    expect(screen.queryByText('Escuelas en riesgo')).not.toBeInTheDocument()
    cargando.unmount()

    const error = render(<PanelRadar {...props({ error: 'falló' })} />)
    expect(screen.getByRole('status')).toHaveTextContent('No se pudo cargar el pronóstico. Intente de nuevo más tarde.')
    error.unmount()

    const sinPronostico = render(<PanelRadar {...props({ disponibles: [], pronostico: { ...pronosticoVacio, resumen: { ...resumenMeteo(), sinDatos: true, departamentos: [] } } })} />)
    expect(screen.getByText('Todavía no hay un pronóstico disponible. Vuelva a consultar más tarde.')).toBeInTheDocument()
    expect(screen.queryByText('Escuelas en riesgo')).not.toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Horizonte' })).getAllByRole('button').every((boton) => boton.getAttribute('aria-disabled') === 'false')).toBe(true)
    sinPronostico.unmount()

    render(<PanelRadar {...props({ puntos: [] })} />)
    expect(screen.getByText('Escuelas en riesgo').previousElementSibling).toHaveTextContent('0')
    expect(screen.getByText('Ninguna escuela en riesgo para estos filtros.')).toBeInTheDocument()
  })

  it('mantiene visible la sección de alertas cuando no hay pronóstico del motor de riesgo', () => {
    render(<PanelRadar {...props({ disponibles: [] })} />)

    expect(screen.getByRole('region', { name: 'Alertas del SMN' })).toBeInTheDocument()
    expect(screen.getByText('Sin alertas oficiales vigentes ni próximas · SMN')).toBeInTheDocument()
  })

  it('no incluye textos técnicos ni repite escuelas con varios niveles educativos', () => {
    const { container } = render(<PanelRadar {...props()} />)

    expect(container.textContent).not.toMatch(/lluvia observada|fuente|corrida|ensamble|modelo|metodolog|extracto/i)
    expect(screen.getAllByText('Escuela Moderada')).toHaveLength(1)
  })

  it('muestra el pronóstico aunque el motor de riesgo no tenga datos', () => {
    render(<PanelRadar {...props({ disponibles: [], pronostico: { ...pronosticoVacio, resumen: resumenMeteo() } })} />)
    expect(screen.queryByText('Todavía no hay un pronóstico disponible. Vuelva a consultar más tarde.')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Resumen del pronóstico')).toBeInTheDocument()
    const filas = screen.getAllByRole('button').filter((boton) => boton.className.includes('map-radar-pronostico__fila'))
    expect(filas.map((fila) => fila.getAttribute('aria-label'))).toEqual(['Bella Vista, 70 mm', 'Goya, 32 mm', 'General Alvear, 0 mm'])
    const horizonte = screen.getByRole('group', { name: 'Horizonte' })
    expect(within(horizonte).getAllByRole('button').every((boton) => boton.getAttribute('aria-disabled') !== 'true')).toBe(true)
  })

  it('actualiza la lluvia mostrada al cambiar el horizonte', () => {
    const resumen = resumenMeteo()
    const { rerender } = render(<PanelRadar {...props({ horizonte: 24, disponibles: [], pronostico: { ...pronosticoVacio, resumen } })} />)
    expect(screen.getByRole('button', { name: 'Bella Vista, 30 mm' })).toBeInTheDocument()
    rerender(<PanelRadar {...props({ horizonte: 240, disponibles: [], pronostico: { ...pronosticoVacio, resumen } })} />)
    expect(screen.getByRole('button', { name: 'Bella Vista, 70 mm' })).toBeInTheDocument()
  })

  it('muestra motor y pronóstico juntos, y pasa la selección del departamento', () => {
    const onDepartamento = vi.fn()
    render(<PanelRadar {...props({ pronostico: { ...pronosticoVacio, resumen: resumenMeteo(), onDepartamento } })} />)
    expect(screen.getByRole('region', { name: 'Riesgo calculado (probabilístico)' })).toBeInTheDocument()
    expect(screen.getByText('Pronóstico por departamento')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Bella Vista, 70 mm' }))
    expect(onDepartamento).toHaveBeenCalledWith('bella-vista')
  })

  it('muestra carga, vacío y error del pronóstico sin motor', () => {
    const cargando = render(<PanelRadar {...props({ disponibles: [], pronostico: { ...pronosticoVacio, cargando: true } })} />)
    expect(screen.getByRole('status')).toHaveTextContent('Cargando pronóstico…')
    cargando.unmount()
    const sinDatos = render(<PanelRadar {...props({ disponibles: [], pronostico: { ...pronosticoVacio, resumen: { ...resumenMeteo(), sinDatos: true, departamentos: [] } } })} />)
    expect(screen.getByText('Todavía no hay un pronóstico disponible. Vuelva a consultar más tarde.')).toBeInTheDocument()
    sinDatos.unmount()
    render(<PanelRadar {...props({ disponibles: [], error: 'falló', pronostico: { ...pronosticoVacio, error: true } })} />)
    expect(screen.getByRole('status')).toHaveTextContent('No se pudo cargar el pronóstico. Intente de nuevo más tarde.')
  })

  it('ubica el riesgo calculado en el mismo lugar al cargar y al terminar, antes de las alertas', () => {
    const { rerender } = render(<PanelRadar {...props({ cargando: true, disponibles: [], puntos: null })} />)
    const secciones = () => Array.from(screen.getByTestId('panel-radar').querySelectorAll(':scope > section')).map((s) => s.getAttribute('aria-labelledby'))
    const antes = secciones()
    rerender(<PanelRadar {...props()} />)
    expect(secciones()).toEqual(antes)
    expect(antes.indexOf('map-radar-riesgo-titulo')).toBeLessThan(antes.indexOf('radar-alertas-smn-titulo'))
    const riesgo = screen.getByRole('region', { name: 'Riesgo calculado (probabilístico)' })
    expect(within(riesgo).getByText('Escuelas en riesgo')).toBeInTheDocument()
  })

  it('encabeza el pronóstico con su título antes de los indicadores', () => {
    render(<PanelRadar {...props({ pronostico: { ...pronosticoVacio, resumen: resumenMeteo() } })} />)
    const seccion = screen.getByRole('region', { name: /Pronóstico por departamento/ })
    expect(seccion.firstElementChild?.tagName).toBe('H3')
  })

  it('muestra 3 escuelas en riesgo y un "Ver más" que despliega el resto', () => {
    const conAmenaza = puntos.map((punto) =>
      punto.cueAnexo === '400' && punto.horizonteHoras === 72 ? { ...punto, nivelAmenaza: 'alto' } : punto,
    )
    render(<PanelRadar {...props({ puntos: conAmenaza })} />)
    const filas = () => screen.getAllByRole('button').filter((boton) => boton.className.includes('map-sitact__fila'))
    expect(filas()).toHaveLength(3)

    fireEvent.click(screen.getByRole('button', { name: 'Ver más (1)' }))
    expect(filas()).toHaveLength(4)
    expect(screen.getByRole('button', { name: 'Ver menos' })).toHaveAttribute('aria-expanded', 'true')
  })
})

