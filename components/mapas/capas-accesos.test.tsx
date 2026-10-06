// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CruceAccesoOsm } from '@/lib/db/schema'
import { CAPA_CELDAS_EXPOSICION_ID, COLOR_BORDE_CELDAS_EXPOSICION, OPACIDAD_CELDAS_EXPOSICION } from '@/lib/mapas/exposicion-ruta-capas'
import { COLOR_RUTA_ACCESO } from '@/lib/mapas/accesos-capas'
import type { resumirCobertura } from '@/lib/mapas/accesos-capas'
import { territorioCon } from '@/components/test-utils/territorio-mapa'
import {
  CAPAS_ACCESOS_LABELS,
  AccesosLayerControl,
  type CapaAccesos,
} from './layer-control'
import {
  CAPA_AISLAMIENTO_ID,
  CAPA_CRUCES_ACCESO_ID,
  CAPA_INUNDACION_ID,
  CAPA_RUTA_ACCESO_CASING_ID,
  CAPA_RUTA_ACCESO_ID,
  CapasAccesosTerritoriales,
  LeyendaAccesos,
  bboxRuta,
} from './capas-accesos'

// react-map-gl/maplibre necesita WebGL (no existe en jsdom): se reemplaza por un
// doble mínimo, igual que en map-infraestructura-page.test.tsx. `Source` expone
// su id como testid y `Layer` serializa sus props para poder inspeccionar qué
// capas se montan y con qué layout/paint.
vi.mock('react-map-gl/maplibre', () => {
  const Source = (props: { id?: string; children?: React.ReactNode }) => (
    <div data-testid={`mock-source-${props.id ?? 'sin-id'}`}>{props.children ?? null}</div>
  )
  const Layer = (props: {
    id?: string
    type?: string
    layout?: unknown
    paint?: unknown
  }) => (
    <div
      data-testid={`mock-layer-${props.id}`}
      data-layer-type={props.type}
      data-layout={JSON.stringify(props.layout ?? null)}
      data-paint={JSON.stringify(props.paint ?? null)}
    />
  )
  return { __esModule: true, default: () => null, Source, Layer }
})

afterEach(() => {
  document.body.innerHTML = ''
})

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const fcPuntos = (): GeoJSON.FeatureCollection => ({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-58.83, -27.47] },
      properties: { icono: 'icono-x' },
    },
  ],
})

const fcRuta = (): GeoJSON.FeatureCollection => ({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [-58.9, -27.5],
          [-58.8, -27.4],
        ],
      },
      properties: {},
    },
  ],
})

const fcCruces = (): GeoJSON.FeatureCollection => ({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-58.85, -27.45] },
      properties: { icono: 'icono-cruce' },
    },
  ],
})

const fcCeldas: GeoJSON.FeatureCollection<GeoJSON.Polygon> = {
  type: 'FeatureCollection',
  features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]]] }, properties: { profundidadM: 0.5 } }],
}

const visibles = (activas: CapaAccesos[]): Record<CapaAccesos, boolean> => ({
  aislamiento: activas.includes('aislamiento'),
  inundacion: activas.includes('inundacion'),
})

const territorio = territorioCon({}, {}, {
  aislamiento: { versionJob: '1' },
  susceptibilidad: { fechaCorrida: '2026-05-15' },
})

const resumen: ReturnType<typeof resumirCobertura> = {
  aislamiento: { 0: 5, 1: 3, 2: 2, 3: 1, sin_datos_red: 4, sin_cobertura: 7 },
  inundacion: { sin_cobertura: 2, sin_profundidad: 3, baja: 4, media: 5, alta: 6 },
  total: 27,
}

const cruces: CruceAccesoOsm[] = []

function crearLeyenda(overrides: Partial<Parameters<typeof LeyendaAccesos>[0]> = {}) {
  return (
    <LeyendaAccesos
      visibles={visibles(['aislamiento', 'inundacion'])}
      territorio={territorio}
      territorioLoading={false}
      territorioError={null}
      resumen={resumen}
      {...overrides}
    />
  )
}

function renderLeyenda(overrides: Partial<Parameters<typeof LeyendaAccesos>[0]> = {}) {
  return render(crearLeyenda(overrides))
}

// ---------------------------------------------------------------------------
// Capas
// ---------------------------------------------------------------------------

describe('CapasAccesosTerritoriales', () => {
  const base = {
    puntosAislamiento: fcPuntos(),
    puntosInundacion: fcPuntos(),
    ruta: fcRuta(),
    cruces: fcCruces(),
    iconosListos: true,
    oscuro: false,
  }

  it('monta la ruta con geometría aunque las capas territoriales estén apagadas', () => {
    render(
      <CapasAccesosTerritoriales {...base} visibles={visibles([])} />,
    )
    expect(screen.getByTestId(`mock-layer-${CAPA_RUTA_ACCESO_ID}`)).toBeInTheDocument()
    expect(screen.queryByTestId(`mock-layer-${CAPA_AISLAMIENTO_ID}`)).not.toBeInTheDocument()
  })

  it.each([
    {
      titulo: 'no monta símbolos si los íconos todavía no están registrados',
      overrides: { iconosListos: false },
    },
    {
      titulo: 'no monta una capa territorial si su dato es null',
      overrides: { puntosAislamiento: null, puntosInundacion: null },
    },
  ])('$titulo', ({ overrides }) => {
    render(
      <CapasAccesosTerritoriales
        {...base}
        visibles={visibles(['aislamiento', 'inundacion'])}
        {...overrides}
      />,
    )
    expect(screen.queryByTestId(`mock-layer-${CAPA_AISLAMIENTO_ID}`)).not.toBeInTheDocument()
    expect(screen.queryByTestId(`mock-layer-${CAPA_INUNDACION_ID}`)).not.toBeInTheDocument()
  })

  it('monta símbolos con icon-image data-driven y tamaño por zoom', () => {
    render(
      <CapasAccesosTerritoriales
        {...base}
        visibles={visibles(['aislamiento', 'inundacion'])}
      />,
    )
    const aislamiento = screen.getByTestId(`mock-layer-${CAPA_AISLAMIENTO_ID}`)
    expect(aislamiento).toHaveAttribute('data-layer-type', 'symbol')
    expect(aislamiento.getAttribute('data-layout')).toContain('icono')
    expect(aislamiento.getAttribute('data-layout')).toContain('interpolate')

    expect(screen.queryByTestId(`mock-layer-${CAPA_INUNDACION_ID}`)).not.toBeInTheDocument()
  })

  it('monta la ruta automáticamente cuando hay geometría, sin toggle', () => {
    const { rerender } = render(
      <CapasAccesosTerritoriales {...base} visibles={visibles([])} oscuro={false} />,
    )
    const casingClaro = screen.getByTestId(`mock-layer-${CAPA_RUTA_ACCESO_CASING_ID}`)
    const linea = screen.getByTestId(`mock-layer-${CAPA_RUTA_ACCESO_ID}`)
    expect(casingClaro).toHaveAttribute('data-layer-type', 'line')
    expect(JSON.parse(casingClaro.getAttribute('data-paint')!)).toMatchObject({
      'line-color': '#ffffff',
      'line-width': 7,
    })
    expect(JSON.parse(linea.getAttribute('data-paint')!)).toMatchObject({
      'line-color': COLOR_RUTA_ACCESO,
      'line-width': 4,
    })

    rerender(
      <CapasAccesosTerritoriales {...base} visibles={visibles([])} oscuro />,
    )
    expect(
      JSON.parse(screen.getByTestId(`mock-layer-${CAPA_RUTA_ACCESO_CASING_ID}`).getAttribute('data-paint')!),
    ).toMatchObject({ 'line-color': '#111827' })
  })

  it('monta celdas debajo de la ruta y solo con la ruta seleccionada visible', () => {
    const { container, rerender } = render(
      <CapasAccesosTerritoriales {...base} celdasExposicion={fcCeldas} visibles={visibles([])} />,
    )
    const celdas = screen.getByTestId(`mock-layer-${CAPA_CELDAS_EXPOSICION_ID}`)
    expect(celdas).toHaveAttribute('data-layer-type', 'fill')
    expect(JSON.parse(celdas.getAttribute('data-paint')!)).toMatchObject({
      'fill-opacity': OPACIDAD_CELDAS_EXPOSICION,
      'fill-outline-color': COLOR_BORDE_CELDAS_EXPOSICION,
    })
    expect(JSON.parse(screen.getByTestId('mock-layer-infra-celdas-exposicion-outline').getAttribute('data-paint')!)).toMatchObject({
      'line-color': COLOR_BORDE_CELDAS_EXPOSICION,
      'line-width': 1.5,
    })
    expect(container.querySelector(`[data-testid="mock-layer-${CAPA_CELDAS_EXPOSICION_ID}"]`)?.parentElement?.nextElementSibling?.querySelector(`[data-testid="mock-layer-${CAPA_RUTA_ACCESO_CASING_ID}"]`)).not.toBeNull()
    rerender(<CapasAccesosTerritoriales {...base} ruta={null} celdasExposicion={fcCeldas} visibles={visibles([])} />)
    expect(screen.queryByTestId(`mock-layer-${CAPA_CELDAS_EXPOSICION_ID}`)).not.toBeInTheDocument()
  })

  it('monta los cruces con la ruta, permitiendo solapamiento', () => {
    render(
      <CapasAccesosTerritoriales {...base} visibles={visibles([])} />,
    )
    const crucesLayer = screen.getByTestId(`mock-layer-${CAPA_CRUCES_ACCESO_ID}`)
    expect(crucesLayer).toHaveAttribute('data-layer-type', 'symbol')
    expect(JSON.parse(crucesLayer.getAttribute('data-layout')!)).toMatchObject({
      'icon-size': 0.9,
      'icon-allow-overlap': true,
    })
  })

  it('no monta los cruces sin íconos registrados', () => {
    render(
      <CapasAccesosTerritoriales
        {...base}
        visibles={visibles([])}
        iconosListos={false}
      />,
    )
    expect(screen.queryByTestId(`mock-layer-${CAPA_CRUCES_ACCESO_ID}`)).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Leyenda — aislamiento
// ---------------------------------------------------------------------------

describe('LeyendaAccesos — aislamiento', () => {
  it('muestra un ícono por nivel y los conteos sin fuente ni extracto', () => {
    renderLeyenda()
    const bloque = screen.getByTestId('leyenda-aislamiento-contenido')
    expect(bloque.textContent).toContain('Muy baja (0): 5')
    expect(bloque.textContent).toContain('Baja (1): 3')
    expect(bloque.textContent).toContain('Media (2): 2')
    expect(bloque.textContent).toContain('Alta (3): 1')
    expect(bloque.textContent).toContain('No calculable: 4')
    expect(bloque.textContent).toContain('Sin dato (escuela fuera de los datos): 7')
    // Un ícono por cada nivel (5) — la fila "sin dato" no lleva ícono.
    expect(bloque.querySelectorAll('img')).toHaveLength(5)
    expect(bloque.textContent).not.toMatch(/ODbL|OpenStreetMap|extracto|fecha|versión|job/i)
  })

  it('no muestra textos de metodología o descargo', () => {
    renderLeyenda()
    expect(screen.queryByTestId('leyenda-aislamiento-ayuda')).not.toBeInTheDocument()
    expect(screen.getByTestId('leyenda-accesos').textContent).not.toMatch(/pronóstico|período|modelo|fuente|metodología/i)
  })

  it('muestra carga, error y falta de datos importados', () => {
    const { rerender } = renderLeyenda({
      visibles: visibles(['aislamiento']),
      territorio: null,
      territorioLoading: true,
    })
    expect(screen.getByTestId('leyenda-territorio-cargando')).toHaveTextContent(
      'Cargando capas territoriales…',
    )

    rerender(crearLeyenda({
      visibles: visibles(['aislamiento']), territorio: null, territorioLoading: false,
      territorioError: 'boom', resumen: null,
    }))
    expect(screen.getByRole('alert')).toHaveTextContent('boom')

    rerender(crearLeyenda({
      visibles: visibles(['aislamiento']), territorio: null, territorioLoading: false,
      territorioError: null, resumen,
    }))
    expect(screen.getByTestId('leyenda-aislamiento-sin-datos')).toHaveTextContent(
      'Sin datos de caminos cargados.',
    )
  })
})

// ---------------------------------------------------------------------------
// Leyenda — inundación
// ---------------------------------------------------------------------------

describe('LeyendaAccesos — inundación', () => {
  it('no muestra leyenda de agua estimada aunque esté activada en los datos', () => {
    renderLeyenda({ visibles: visibles(['inundacion']) })
    expect(screen.queryByTestId('leyenda-inundacion')).not.toBeInTheDocument()
    expect(screen.queryByText(/agua estimada/i)).not.toBeInTheDocument()
  })

  it('no presenta metodología o datos de fuente', () => {
    renderLeyenda({ visibles: visibles(['inundacion']) })
    expect(screen.queryByTestId('leyenda-inundacion-ayuda')).not.toBeInTheDocument()
    expect(screen.queryByText(/período de retorno|physrisk|corrida|pronóstico|modelo/i)).not.toBeInTheDocument()
  })

  it('no monta la capa de inundación cuando está desactivada', () => {
    renderLeyenda({ visibles: visibles(['inundacion']), territorio: null, resumen })
    expect(screen.queryByTestId('leyenda-inundacion-sin-datos')).not.toBeInTheDocument()
    expect(screen.queryByTestId('leyenda-inundacion')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Leyenda — ruta
// ---------------------------------------------------------------------------

describe('LeyendaAccesos — ruta', () => {
  it('no muestra un bloque de ayuda para elegir escuela o encuadrar la ruta', () => {
    const { rerender } = renderLeyenda({
      visibles: visibles([]),
    })
    expect(screen.queryByText(/Elegí|Seleccione una escuela para ver el camino/i)).not.toBeInTheDocument()
    rerender(crearLeyenda({
      visibles: visibles([]),
    }))
  })
})

// ---------------------------------------------------------------------------
// Estado territorial compartido
// ---------------------------------------------------------------------------

describe('LeyendaAccesos — estado territorial compartido', () => {
  it('muestra una sola carga para las dos capas territoriales visibles', () => {
    renderLeyenda({ visibles: visibles(['aislamiento', 'inundacion']), territorioLoading: true })
    expect(screen.getAllByTestId('leyenda-territorio-cargando')).toHaveLength(1)
    expect(screen.getAllByText('Cargando capas territoriales…')).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Tarjeta única de la leyenda
// ---------------------------------------------------------------------------

describe('LeyendaAccesos — tarjeta de la leyenda', () => {
  it('muestra solamente la leyenda territorial', () => {
    renderLeyenda()
    const aislamiento = screen.getByTestId('leyenda-aislamiento')
    expect(screen.queryByTestId('leyenda-ruta')).not.toBeInTheDocument()
  })

  it('envuelve los bloques visibles en una sola tarjeta .map-panel', () => {
    renderLeyenda()
    const secciones = screen.getAllByTestId('leyenda-accesos')
    expect(secciones).toHaveLength(1)
    const seccion = secciones[0]
    // `styles.panel` da el fondo opaco; sin él el texto se imprimía sobre el
    // mapa y los tres bloques se apilaban sin separación.
    expect(seccion).toHaveClass('map-panel')
    expect(seccion).toHaveClass('map-leyenda-accesos')
    expect(seccion.tagName).toBe('SECTION')
    expect(seccion).toHaveAttribute('aria-label', 'Datos territoriales')
    for (const id of ['leyenda-aislamiento']) {
      expect(seccion).toContainElement(screen.getByTestId(id))
    }
  })

  it('no monta la tarjeta si no hay ningún bloque visible', () => {
    renderLeyenda({ visibles: visibles([]) })
    expect(screen.queryByTestId('leyenda-accesos')).not.toBeInTheDocument()
  })

  it('no monta ayudas de fuente o metodología', () => {
    renderLeyenda()
    expect(screen.queryByTestId('leyenda-aislamiento-ayuda')).not.toBeInTheDocument()
    expect(screen.queryByTestId('leyenda-ruta-ayuda')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Render nulo
// ---------------------------------------------------------------------------

describe('LeyendaAccesos — sin bloques visibles', () => {
  it('no renderiza nada', () => {
    const { container } = renderLeyenda({ visibles: visibles([]) })
    expect(container.firstChild).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// bboxRuta
// ---------------------------------------------------------------------------

describe('bboxRuta', () => {
  it('devuelve null sin ruta o sin coordenadas', () => {
    expect(bboxRuta(null)).toBeNull()
    expect(bboxRuta({ type: 'FeatureCollection', features: [] })).toBeNull()
  })

  it('devuelve el min/max de las coordenadas de la LineString', () => {
    expect(bboxRuta(fcRuta())).toEqual([
      [-58.9, -27.5],
      [-58.8, -27.4],
    ])
  })
})

// ---------------------------------------------------------------------------
// Control de capas
// ---------------------------------------------------------------------------

describe('AccesosLayerControl', () => {
  it('oculta agua estimada y notifica el toggle de aislamiento', async () => {
    const onChange = vi.fn()
    render(
      <AccesosLayerControl
        capas={{ aislamiento: false, inundacion: false }}
        onChange={onChange}
      />,
    )
    expect(screen.getByText('Capas territoriales')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: CAPAS_ACCESOS_LABELS.inundacion })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /camino y cruces/i })).not.toBeInTheDocument()
    expect(
      screen.getByRole('checkbox', { name: CAPAS_ACCESOS_LABELS.aislamiento }),
    ).not.toBeChecked()

    await userEvent.click(
      screen.getByRole('checkbox', { name: CAPAS_ACCESOS_LABELS.aislamiento }),
    )
    expect(onChange).toHaveBeenCalledWith('aislamiento', true)
  })
})
