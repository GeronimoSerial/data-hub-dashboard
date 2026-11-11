// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { cleanup, render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InfraestructuraMapClient } from './map-client'
import { MOTOR_VERSION, REGLAS_V04_VERSION } from '@/lib/infraestructura/riesgo/motor/config'
import type { EscuelasMapaPadronResultado } from '@/lib/infraestructura/parte-mapa'

const PADRON_PRUEBA: EscuelasMapaPadronResultado = {
  escuelas: [
    { cueAnexo: '180001-00', nombre: 'Escuela Primaria', departamento: 'Capital', localidad: 'Corrientes', lat: -27.4, lon: -58.8, estado: 'sin_afectacion_reportada', niveles: ['Primario'], alumnos: 20, gravedad: 2, categoriaPrincipal: null, clases: 'normal', apoyo: null, sinActualizar: false, ultimaNovedad: null, alumnosSinClases: 0, situacionesHistoricas: 0, solucionadasRecientes: 0 },
    { cueAnexo: '180002-00', nombre: 'Escuela Secundaria', departamento: 'Goya', localidad: 'Goya', lat: -29.1, lon: -59.2, estado: 'sin_afectacion_reportada', niveles: ['Secundario'], alumnos: 30, gravedad: 1, categoriaPrincipal: null, clases: 'normal', apoyo: null, sinActualizar: false, ultimaNovedad: null, alumnosSinClases: 0, situacionesHistoricas: 0, solucionadasRecientes: 0 },
    { cueAnexo: '180003-00', nombre: 'Escuela Rural', departamento: 'Ituzaingó', localidad: 'Ituzaingó', lat: -27.6, lon: -56.7, estado: 'sin_afectacion_reportada', niveles: ['Primario', 'Secundario'], alumnos: 15, gravedad: 0, categoriaPrincipal: null, clases: 'normal', apoyo: null, sinActualizar: false, ultimaNovedad: null, alumnosSinClases: 0, situacionesHistoricas: 0, solucionadasRecientes: 0 },
    { cueAnexo: '1800087-00', nombre: 'Escuela N° 87 Colonia Tatacuá', departamento: 'San Roque', localidad: 'Tatacuá', lat: -28.2, lon: -58.1, estado: 'sin_afectacion_reportada', niveles: ['Primario'], alumnos: 18, gravedad: 0, categoriaPrincipal: null, clases: 'normal', apoyo: null, sinActualizar: false, ultimaNovedad: null, alumnosSinClases: 0, situacionesHistoricas: 0, solucionadasRecientes: 0 },
  ],
  sinUbicacion: [{ cueAnexo: '180004-00', nombre: 'Escuela sin ubicación', departamento: 'Goya', localidad: 'Goya' }],
  totalPadron: 4,
}

// Contador de MONTAJES del mapa (no de renders: el cuerpo de un componente
// se ejecuta en cada render, y cambiar de pestaña re-renderiza el árbol aunque
// el mapa no se desmonte). Si cambiar de pestaña desmontara MapLibre, el
// contador subiría y el nodo del DOM sería otro: las dos señales juntas son
// la evidencia de que el mapa sólo se OCULTA (F5.1).
// `vi.hoisted` porque las fábricas de `vi.mock` se izan antes que cualquier
// declaración normal de este archivo.
const montajesMapa = vi.hoisted(() => ({ total: 0 }))
const registroSeleccion = vi.hoisted(() => ({
  escuelasSeleccionadas: [] as EscuelasMapaPadronResultado['escuelas'],
  hashesAlSeleccionar: [] as string[],
}))
const registroPantallaCompleta = vi.hoisted(() => ({
  contenedor: null as React.RefObject<HTMLElement | null> | null,
}))

function chipPrincipal(nombre: string) {
  const chips = document.querySelector<HTMLElement>('.filtros-chips-principales')
  if (!chips) throw new Error('No se encontró el grupo de chips principales')
  return within(chips).getByRole('button', { name: nombre })
}

vi.mock('@/components/mapas/map-infraestructura-page', () => ({
  default: function MapaDePrueba(props: {
    pestana: string
    panel: string
    visible?: boolean
    escuelasMapa: EscuelasMapaPadronResultado | null
    onRegistrarSeleccion?: (fn: ((escuela: EscuelasMapaPadronResultado['escuelas'][number]) => void) | null) => void
    contenedorPantallaCompleta?: React.RefObject<HTMLElement | null>
  }): React.JSX.Element {
    registroPantallaCompleta.contenedor = props.contenedorPantallaCompleta ?? null
    const [cueSeleccionado, setCueSeleccionado] = React.useState<string | null>(null)
    React.useEffect(() => {
      montajesMapa.total += 1
    }, [])
    React.useEffect(() => {
      props.onRegistrarSeleccion?.((escuela) => {
        registroSeleccion.escuelasSeleccionadas.push(escuela)
        registroSeleccion.hashesAlSeleccionar.push(window.location.hash)
        setCueSeleccionado(escuela.cueAnexo)
      })
      return () => props.onRegistrarSeleccion?.(null)
    }, [props.onRegistrarSeleccion])
    return (
      <div data-testid="mock-mapa" data-pestana={props.pestana} data-panel={props.panel} data-visible={props.visible} data-seleccion={cueSeleccionado ?? ''} data-escuelas={props.escuelasMapa?.escuelas.length ?? 0} data-cues={props.escuelasMapa?.escuelas.map((escuela) => escuela.cueAnexo).join(',') ?? ''}>
        <div data-testid="panel-lateral" />
      </div>
    )
  },
}))

vi.mock('@/lib/infraestructura/use-escuelas-mapa', () => ({
  useEscuelasMapa: () => ({ data: PADRON_PRUEBA, loading: false, error: null }),
}))

vi.mock('@/components/infraestructura/evolucion-panel', () => ({
  EvolucionPanel: (props: { filtros: object }) => (
    <div data-testid="mock-evolucion" data-filtros={JSON.stringify(props.filtros)} />
  ),
}))

beforeEach(() => {
  montajesMapa.total = 0
  registroSeleccion.escuelasSeleccionadas = []
  registroSeleccion.hashesAlSeleccionar = []
  window.history.pushState({}, '', '/')
  window.location.hash = ''
})

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  window.history.pushState({}, '', '/')
})

describe('InfraestructuraMapClient — pestañas sobre el mapa', () => {
  it('usa la raíz fullscreen del layout compartido en vez del mapa que se oculta al abrir la ficha', async () => {
    const raiz = document.createElement('div')
    const referencia = { current: raiz }
    render(<InfraestructuraMapClient mostrarEnlaceNominal pantallaCompletaRef={referencia} />)
    await waitFor(() => expect(registroPantallaCompleta.contenedor).toBe(referencia))
    expect(registroPantallaCompleta.contenedor?.current).toBe(raiz)
  })

  it('muestra tres chips en línea y Más filtros con asistencia y switches', async () => {
    render(<InfraestructuraMapClient mostrarEnlaceNominal />)
    const principales = document.querySelector<HTMLElement>('.filtros-chips-principales')
    if (!principales) throw new Error('No se encontró el grupo de chips principales')
    expect(within(principales).getAllByRole('button').map((boton) => boton.textContent?.trim())).toEqual([
      'Departamento', 'Gravedad', 'Clases',
    ])

    await userEvent.click(screen.getByRole('button', { name: 'Más filtros' }))
    const panel = screen.getByRole('dialog', { name: 'Más filtros' })
    expect(within(panel).getByText('Asistencia pedagógica')).toBeInTheDocument()
    await userEvent.click(within(panel).getByRole('checkbox', { name: /Se brinda/ }))
    await userEvent.click(within(panel).getByRole('switch', { name: 'Sin actualizar' }))
    expect(screen.getByRole('button', { name: 'Más filtros, 2 activos' })).toBeInTheDocument()
  })

  it('muestra una sola fila con Situación actual, Radar, Planificación, Capas, Estadísticas y Exportar, sin la pestaña Metodología', () => {
    render(<InfraestructuraMapClient mostrarEnlaceNominal riskRadarEnabled />)
    const tabs = screen.getAllByRole('tab').map((t) => t.textContent?.replace(/\d+$/, '').trim())
    expect(tabs).toEqual(['Situación actual', 'Radar', 'Planificación', 'Capas', 'Estadísticas', 'Exportar'])
  })

  it('muestra el acceso al call center solo si se habilita', () => {
    const { unmount } = render(<InfraestructuraMapClient mostrarEnlaceNominal />)
    expect(screen.queryByRole('link', { name: 'Call center' })).not.toBeInTheDocument()
    unmount()
    render(<InfraestructuraMapClient mostrarEnlaceNominal mostrarCallCenter />)
    expect(screen.getByRole('link', { name: 'Call center' })).toHaveAttribute('href', '/call-center')
  })

  it('sigue montando la metodología operativa si se llega por el hash y conserva el mapa', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    try {
      window.location.hash = '#metodologia'
      render(<InfraestructuraMapClient mostrarEnlaceNominal />)
      const mapa = screen.getByTestId('mock-mapa')
      const metodologia = screen.getByTestId('pestana-metodologia')
      expect(metodologia).toHaveTextContent(MOTOR_VERSION)
      expect(metodologia).toHaveTextContent(REGLAS_V04_VERSION)
      expect(within(metodologia).getByLabelText('Horizonte', { selector: '#r-horizonte' })).toHaveValue('72')
      expect(screen.getByTestId('mock-mapa')).toBe(mapa)
      expect(mapa).toHaveAttribute('data-visible', 'false')
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('sin el flag del radar no muestra la pestaña Radar', () => {
    render(<InfraestructuraMapClient mostrarEnlaceNominal riskRadarEnabled={false} />)
    expect(screen.queryByRole('tab', { name: /Radar/ })).toBeNull()
  })

  it('muestra el contador de escuelas con situaciones abiertas y lo actualiza con los filtros', async () => {
    render(<InfraestructuraMapClient mostrarEnlaceNominal />)

    const pestaña = screen.getByRole('tab', { name: 'Situación actual, 2 escuelas con situaciones abiertas' })
    expect(pestaña.querySelector('.map-sitact__pill')).toHaveTextContent('2')
    expect(pestaña.querySelector('.map-sitact__pill')).toHaveClass('ui-tabs-tab__contador')

    await userEvent.click(chipPrincipal('Departamento'))
    await userEvent.click(screen.getByRole('checkbox', { name: /Goya/ }))

    const pestañaFiltrada = screen.getByRole('tab', { name: 'Situación actual, 1 escuela con situaciones abiertas' })
    expect(pestañaFiltrada.querySelector('.map-sitact__pill')).toHaveTextContent('1')
  })

  it('no muestra el contador cuando no hay escuelas con situaciones abiertas', async () => {
    render(<InfraestructuraMapClient mostrarEnlaceNominal />)

    await userEvent.click(screen.getByRole('button', { name: 'Buscar escuela o CUE' }))
    await userEvent.type(screen.getByRole('combobox', { name: 'Buscar escuela o CUE' }), 'sin resultados')

    const pestaña = screen.getByRole('tab', { name: 'Situación actual' })
    expect(pestaña.querySelector('.map-sitact__pill')).toBeNull()
  })

  it('la pantalla completa abarca las pestañas, los filtros y el mapa', () => {
    render(<InfraestructuraMapClient mostrarEnlaceNominal />)
    const contenedor = registroPantallaCompleta.contenedor?.current
    expect(contenedor).toBeTruthy()
    expect(contenedor).toContainElement(screen.getByRole('tab', { name: /^Situación actual/ }))
    expect(contenedor).toContainElement(screen.getByRole('button', { name: 'Buscar escuela o CUE' }))
    expect(contenedor).toContainElement(screen.getByTestId('mock-mapa'))
  })

  it('mantiene las pestañas y los filtros en el mismo contenedor, con las pestañas primero', async () => {
    render(<InfraestructuraMapClient mostrarEnlaceNominal />)
    const tabs = screen.getByRole('tab', { name: /^Situación actual/ })
    const filtros = screen.getByRole('button', { name: 'Buscar escuela o CUE' }).closest('.filtros-barra')
    expect(filtros).not.toBeNull()
    const barra = tabs.closest('.mapa-pestanas-barra')
    expect(barra).not.toBeNull()
    expect(barra).toContainElement(tabs)
    expect(barra).toContainElement(filtros as HTMLElement)
    expect(tabs.compareDocumentPosition(filtros as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    await userEvent.click(screen.getByRole('tab', { name: 'Estadísticas' }))
    expect(screen.getByRole('button', { name: 'Buscar escuela o CUE' })).toBeVisible()
  })

  it('pasa los filtros activos a la sección de evolución', async () => {
    render(<InfraestructuraMapClient mostrarEnlaceNominal />)
    await userEvent.click(chipPrincipal('Departamento'))
    await userEvent.click(screen.getByRole('checkbox', { name: /Goya/ }))
    await userEvent.click(screen.getByRole('tab', { name: 'Estadísticas' }))

    expect(screen.getByTestId('mock-evolucion')).toHaveAttribute(
      'data-filtros',
      expect.stringContaining('"departamentos":["Goya"]'),
    )
  })

  it('filtra las escuelas del mapa por departamento, conserva el mapa montado y permite limpiar', async () => {
    render(<InfraestructuraMapClient mostrarEnlaceNominal />)
    const mapa = await screen.findByTestId('mock-mapa')
    expect(mapa).toHaveAttribute('data-escuelas', '4')
    expect(montajesMapa.total).toBe(1)

    await userEvent.click(chipPrincipal('Departamento'))
    await userEvent.click(screen.getByRole('checkbox', { name: /Goya/ }))
    expect(mapa).toHaveAttribute('data-escuelas', '1')
    expect(mapa).toHaveAttribute('data-cues', '180002-00')
    expect(montajesMapa.total).toBe(1)

    await userEvent.click(screen.getByRole('button', { name: 'Más filtros' }))
    await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }))
    expect(mapa).toHaveAttribute('data-escuelas', '4')
    expect(montajesMapa.total).toBe(1)
  })

  it('selecciona la escuela sugerida mediante el callback registrado por la página', async () => {
    render(<InfraestructuraMapClient mostrarEnlaceNominal />)
    await userEvent.click(screen.getByRole('button', { name: 'Buscar escuela o CUE' }))
    const busqueda = await screen.findByRole('combobox', { name: 'Buscar escuela o CUE' })
    await userEvent.type(busqueda, 'tatacua')
    await userEvent.click(screen.getByRole('option', { name: /1800087-00/ }))

    expect(registroSeleccion.escuelasSeleccionadas).toEqual([PADRON_PRUEBA.escuelas[3]])
  })

  it('selecciona una escuela desde Estadísticas y vuelve a la última pestaña con mapa', async () => {
    render(<InfraestructuraMapClient mostrarEnlaceNominal />)
    await userEvent.click(screen.getByRole('tab', { name: 'Estadísticas' }))
    await userEvent.click(screen.getByRole('button', { name: 'Buscar escuela o CUE' }))
    await userEvent.type(screen.getByRole('combobox', { name: 'Buscar escuela o CUE' }), 'tatacua')
    await userEvent.click(screen.getByRole('option', { name: /1800087-00/ }))

    expect(registroSeleccion.escuelasSeleccionadas).toEqual([PADRON_PRUEBA.escuelas[3]])
    expect(registroSeleccion.hashesAlSeleccionar).toEqual(['#actual'])
    expect(screen.getByRole('tab', { name: /^Situación actual/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('filtra las escuelas del mapa por texto de búsqueda', async () => {
    render(<InfraestructuraMapClient mostrarEnlaceNominal />)
    const mapa = await screen.findByTestId('mock-mapa')
    await userEvent.click(screen.getByRole('button', { name: 'Buscar escuela o CUE' }))
    await userEvent.type(screen.getByRole('combobox', { name: 'Buscar escuela o CUE' }), 'secundaria')
    expect(mapa).toHaveAttribute('data-escuelas', '1')
    expect(mapa).toHaveAttribute('data-cues', '180002-00')
  })

  it('abre Estadísticas como sección independiente y oculta el mapa sin desmontarlo', async () => {
    render(<InfraestructuraMapClient mostrarEnlaceNominal riskRadarEnabled />)
    const mapa = await screen.findByTestId('mock-mapa')
    await userEvent.click(screen.getByRole('tab', { name: 'Estadísticas' }))
    expect(screen.getByTestId('pestana-mapa')).toHaveAttribute('hidden')
    expect(screen.getByTestId('pestana-estadisticas')).toContainElement(screen.getByTestId('mock-evolucion'))
    expect(within(screen.getByTestId('panel-lateral')).queryByRole('heading', { name: 'Estadísticas' })).not.toBeInTheDocument()
    expect(screen.getByTestId('mock-mapa')).toBe(mapa)
    expect(montajesMapa.total).toBe(1)

    await userEvent.click(screen.getByRole('tab', { name: /^Situación actual/ }))
    expect(screen.queryByTestId('pestana-estadisticas')).not.toBeInTheDocument()
    expect(screen.getByTestId('pestana-mapa')).not.toHaveAttribute('hidden')
    expect(screen.getByTestId('mock-mapa')).toBe(mapa)
    expect(montajesMapa.total).toBe(1)
  })

  it('al volver de Estadísticas conserva la pestaña con mapa activa', async () => {
    render(<InfraestructuraMapClient mostrarEnlaceNominal riskRadarEnabled />)
    await userEvent.click(screen.getByRole('tab', { name: 'Radar' }))
    const mapa = screen.getByTestId('mock-mapa')
    expect(mapa).toHaveAttribute('data-pestana', 'radar')

    await userEvent.click(screen.getByRole('tab', { name: 'Estadísticas' }))
    expect(screen.getByTestId('pestana-mapa')).toHaveAttribute('hidden')
    expect(mapa).toHaveAttribute('data-pestana', 'radar')

    await userEvent.click(screen.getByRole('tab', { name: 'Radar' }))
    expect(screen.getByTestId('pestana-mapa')).not.toHaveAttribute('hidden')
    expect(mapa).toHaveAttribute('data-pestana', 'radar')
  })

  it('en Capas deja el mapa en Situación actual y conserva el mapa montado', async () => {
    render(<InfraestructuraMapClient mostrarEnlaceNominal riskRadarEnabled />)
    const mapa = await screen.findByTestId('mock-mapa')
    await userEvent.click(screen.getByRole('tab', { name: 'Capas' }))
    expect(screen.getByTestId('mock-mapa')).toBe(mapa)
    expect(mapa).toHaveAttribute('data-pestana', 'actual')
    expect(mapa).toHaveAttribute('data-panel', 'capas')
    expect(montajesMapa.total).toBe(1)

    await userEvent.click(screen.getByRole('tab', { name: 'Estadísticas' }))
    await userEvent.click(screen.getByRole('tab', { name: 'Capas' }))
    expect(screen.getByTestId('mock-mapa')).toBe(mapa)
    expect(mapa).toHaveAttribute('data-pestana', 'actual')
    expect(mapa).toHaveAttribute('data-panel', 'capas')
    expect(montajesMapa.total).toBe(1)
  })

  it('#capas selecciona la pestaña Capas', async () => {
    window.location.hash = 'capas'
    render(<InfraestructuraMapClient mostrarEnlaceNominal />)
    expect(await screen.findByRole('tab', { name: 'Capas' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('mock-mapa')).toHaveAttribute('data-pestana', 'actual')
    expect(screen.getByTestId('mock-mapa')).toHaveAttribute('data-panel', 'capas')
  })

  it('cambiar entre mapa y Estadísticas conserva la selección y el mapa montado', async () => {
    render(<InfraestructuraMapClient mostrarEnlaceNominal />)

    const mapa = await screen.findByTestId('mock-mapa')
    expect(montajesMapa.total).toBe(1)
    expect(screen.queryByTestId('mock-evolucion')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Buscar escuela o CUE' }))
    await userEvent.type(screen.getByRole('combobox', { name: 'Buscar escuela o CUE' }), 'tatacua')
    await userEvent.click(screen.getByRole('option', { name: /1800087-00/ }))
    expect(mapa).toHaveAttribute('data-seleccion', '1800087-00')
    const cues = mapa.getAttribute('data-cues')

    await userEvent.click(screen.getByRole('tab', { name: 'Estadísticas' }))

    expect(screen.getByTestId('mock-mapa')).toBe(mapa)
    expect(montajesMapa.total).toBe(1)
    expect(screen.getByTestId('pestana-mapa')).toHaveAttribute('hidden')
    expect(mapa).toHaveAttribute('data-seleccion', '1800087-00')
    expect(mapa).toHaveAttribute('data-cues', cues)
    expect(await screen.findByTestId('mock-evolucion')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: /^Situación actual/ }))

    expect(screen.getByTestId('mock-mapa')).toBe(mapa)
    expect(montajesMapa.total).toBe(1)
    expect(mapa).toBeVisible()
    expect(mapa).toHaveAttribute('data-seleccion', '1800087-00')
    expect(mapa).toHaveAttribute('data-cues', cues)
    expect(screen.queryByTestId('mock-evolucion')).not.toBeInTheDocument()
  })

  it('Estadísticas se abre directo desde el hash de la URL', async () => {
    window.location.hash = 'estadisticas'

    render(<InfraestructuraMapClient mostrarEnlaceNominal />)

    expect(await screen.findByTestId('mock-evolucion')).toBeInTheDocument()
    expect(screen.getByTestId('pestana-mapa')).toHaveAttribute('hidden')
    expect(await screen.findByTestId('mock-mapa')).toBeInTheDocument()
    expect(screen.getByTestId('mock-mapa')).toHaveAttribute('data-pestana', 'actual')
    expect(montajesMapa.total).toBe(1)
  })

  it('escribe el hash al cambiar de pestaña, para que el enlace sea copiable', async () => {
    render(<InfraestructuraMapClient mostrarEnlaceNominal />)
    await screen.findByTestId('mock-mapa')

    await userEvent.click(screen.getByRole('tab', { name: 'Estadísticas' }))
    expect(window.location.hash).toBe('#estadisticas')

    await userEvent.click(screen.getByRole('tab', { name: /^Situación actual/ }))
    expect(window.location.hash).toBe('#actual')
  })

  it('mapea el hash viejo #operativa a Situación actual', async () => {
    window.location.hash = 'operativa'
    render(<InfraestructuraMapClient mostrarEnlaceNominal />)

    expect(await screen.findByRole('tab', { name: /^Situación actual/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('mapea el hash viejo #evolucion a Estadísticas y monta evolución', async () => {
    window.location.hash = 'evolucion'
    render(<InfraestructuraMapClient mostrarEnlaceNominal />)

    expect(await screen.findByRole('tab', { name: 'Estadísticas' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(await screen.findByTestId('mock-evolucion')).toBeInTheDocument()
  })

  it('mapea ?modo=radar a Radar cuando está habilitado', async () => {
    window.history.pushState({}, '', '/?modo=radar')
    render(<InfraestructuraMapClient mostrarEnlaceNominal riskRadarEnabled />)

    expect(await screen.findByRole('tab', { name: 'Radar' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('#radar cae en Situación actual cuando Radar está apagado', async () => {
    window.location.hash = 'radar'
    render(<InfraestructuraMapClient mostrarEnlaceNominal riskRadarEnabled={false} />)

    expect(await screen.findByRole('tab', { name: /^Situación actual/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('un hash desconocido deja Situación actual seleccionada', async () => {
    window.location.hash = 'basura'
    render(<InfraestructuraMapClient mostrarEnlaceNominal />)

    expect(await screen.findByRole('tab', { name: /^Situación actual/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('agrupa visualmente modos operativos, capas y vistas de referencia dentro del contenedor de pestañas', () => {
    render(<InfraestructuraMapClient mostrarEnlaceNominal riskRadarEnabled />)

    const tablist = screen.getByRole('tablist', {
      name: 'Modos y vistas de ENOS 2026',
    })
    expect(tablist).toBeInTheDocument()
    expect(tablist.parentElement).toHaveAttribute('data-overflow')
    expect(screen.getByRole('tab', { name: 'Capas' })).toHaveAttribute('data-cluster-start', 'true')
    expect(screen.getByRole('tab', { name: 'Estadísticas' })).toHaveAttribute(
      'data-cluster-start',
      'true',
    )
    expect(screen.getByRole('tab', { name: 'Planificación' })).not.toHaveAttribute(
      'data-cluster-start',
    )
  })

  it('revealTab usa scrollTo smooth en modo normal y auto cuando prefers-reduced-motion: reduce está activo', async () => {
    let reduceMotion = false
    const matchMediaOriginal = window.matchMedia
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion: reduce') ? reduceMotion : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))

    try {
      render(<InfraestructuraMapClient mostrarEnlaceNominal />)
      const tablist = screen.getByRole('tablist', {
        name: 'Modos y vistas de ENOS 2026',
      })
      const scrollToSpy = vi.fn()
      tablist.scrollTo = scrollToSpy
      Object.defineProperty(tablist, 'clientWidth', { value: 180, configurable: true })
      Object.defineProperty(tablist, 'scrollLeft', { value: 0, configurable: true })

      const tabMetodologia = screen.getByRole('tab', { name: 'Exportar' })
      Object.defineProperty(tabMetodologia, 'offsetLeft', { value: 320, configurable: true })
      Object.defineProperty(tabMetodologia, 'offsetWidth', { value: 110, configurable: true })

      // Modo normal: behavior 'smooth'
      reduceMotion = false
      await userEvent.click(tabMetodologia)
      expect(scrollToSpy).toHaveBeenLastCalledWith({ left: 270, behavior: 'smooth' })

      // Modo movimiento reducido: behavior 'auto'
      scrollToSpy.mockClear()
      reduceMotion = true
      const tabEstadisticas = screen.getByRole('tab', { name: 'Estadísticas' })
      Object.defineProperty(tabEstadisticas, 'offsetLeft', { value: 220, configurable: true })
      Object.defineProperty(tabEstadisticas, 'offsetWidth', { value: 100, configurable: true })
      await userEvent.click(tabEstadisticas)
      expect(scrollToSpy).toHaveBeenLastCalledWith({ left: 160, behavior: 'auto' })
    } finally {
      window.matchMedia = matchMediaOriginal
    }
  })

  it('selecciona automáticamente la escuela indicada en ?cue= al montar o retornar al mapa (incluyendo escuelas sin ubicación)', () => {
    window.history.pushState({}, '', '/mapas/infraestructura?cue=180004-00&origen=mapa')
    render(<InfraestructuraMapClient mostrarEnlaceNominal />)

    expect(registroSeleccion.escuelasSeleccionadas).toHaveLength(1)
    expect(registroSeleccion.escuelasSeleccionadas[0].cueAnexo).toBe('180004-00')
    expect(registroSeleccion.escuelasSeleccionadas[0].lat).toBeNull()
  })
})
