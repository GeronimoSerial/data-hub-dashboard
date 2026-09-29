// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CruceAccesoOsm } from '@/lib/db/schema'
import type {
  GeometriaAccesoRespuesta,
  TerritorioMapa,
} from '@/lib/infraestructura/territorio-mapa'
import { COLOR_RUTA_ACCESO } from '@/lib/mapas/accesos-capas'
import type { resumirCobertura } from '@/lib/mapas/accesos-capas'
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

const visibles = (activas: CapaAccesos[]): Record<CapaAccesos, boolean> => ({
  aislamiento: activas.includes('aislamiento'),
  inundacion: activas.includes('inundacion'),
  rutaSeleccion: activas.includes('rutaSeleccion'),
})

const territorio: TerritorioMapa = {
  aislamiento: {
    fuente: 'OpenStreetMap',
    atribucion: '© OpenStreetMap contributors',
    licencia: 'ODbL',
    fechaExtractoOsm: '2026-06-01',
    versionJob: '1',
    escuelas: {},
  },
  susceptibilidad: {
    fuente: 'physrisk',
    indicador: 'inundacion_fluvial',
    escenario: 'historico',
    unidad: 'm',
    periodoRetornoAnios: 100,
    fechaCorrida: '2026-05-15',
    licencia: 'Apache-2.0',
    escuelas: {},
  },
}

const resumen: ReturnType<typeof resumirCobertura> = {
  aislamiento: { 0: 5, 1: 3, 2: 2, 3: 1, sin_datos_red: 4, sin_cobertura: 7 },
  inundacion: { sin_cobertura: 2, sin_profundidad: 3, baja: 4, media: 5, alta: 6 },
  total: 27,
}

const cruces: CruceAccesoOsm[] = []

const geometriaDisponible: GeometriaAccesoRespuesta = {
  cueAnexo: '1801605-04',
  disponible: true,
  fechaExtractoOsm: '2026-06-01',
  ruta: {
    type: 'LineString',
    coordinates: [
      [-58.9, -27.5],
      [-58.8, -27.4],
    ],
  },
  cruces,
  resumen: { puente: 0, vado: 0, sinEvidencia: 0 },
}

function renderLeyenda(overrides: Partial<Parameters<typeof LeyendaAccesos>[0]> = {}) {
  return render(
    <LeyendaAccesos
      visibles={visibles(['aislamiento', 'inundacion', 'rutaSeleccion'])}
      territorio={territorio}
      territorioLoading={false}
      territorioError={null}
      resumen={resumen}
      seleccion={null}
      geometria={null}
      geometriaLoading={false}
      geometriaError={null}
      {...overrides}
    />,
  )
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

  it('no monta ninguna capa si todo está invisible', () => {
    render(
      <CapasAccesosTerritoriales {...base} visibles={visibles([])} />,
    )
    expect(screen.queryAllByTestId(/^mock-layer-/)).toHaveLength(0)
  })

  it('no monta símbolos si los íconos todavía no están registrados', () => {
    render(
      <CapasAccesosTerritoriales
        {...base}
        visibles={visibles(['aislamiento', 'inundacion'])}
        iconosListos={false}
      />,
    )
    expect(screen.queryByTestId(`mock-layer-${CAPA_AISLAMIENTO_ID}`)).not.toBeInTheDocument()
    expect(screen.queryByTestId(`mock-layer-${CAPA_INUNDACION_ID}`)).not.toBeInTheDocument()
  })

  it('no monta una capa territorial si su dato es null', () => {
    render(
      <CapasAccesosTerritoriales
        {...base}
        visibles={visibles(['aislamiento', 'inundacion'])}
        puntosAislamiento={null}
        puntosInundacion={null}
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

    const inundacion = screen.getByTestId(`mock-layer-${CAPA_INUNDACION_ID}`)
    expect(inundacion).toHaveAttribute('data-layer-type', 'symbol')
  })

  it('monta la ruta como casing + línea, con el color de casing según el tema', () => {
    const { rerender } = render(
      <CapasAccesosTerritoriales {...base} visibles={visibles(['rutaSeleccion'])} oscuro={false} />,
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
      <CapasAccesosTerritoriales {...base} visibles={visibles(['rutaSeleccion'])} oscuro />,
    )
    expect(
      JSON.parse(screen.getByTestId(`mock-layer-${CAPA_RUTA_ACCESO_CASING_ID}`).getAttribute('data-paint')!),
    ).toMatchObject({ 'line-color': '#111827' })
  })

  it('monta los cruces con la ruta, permitiendo solapamiento', () => {
    render(
      <CapasAccesosTerritoriales {...base} visibles={visibles(['rutaSeleccion'])} />,
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
        visibles={visibles(['rutaSeleccion'])}
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
  it('muestra un ícono por nivel, la fila sin cobertura y los conteos', () => {
    renderLeyenda()
    const bloque = screen.getByTestId('leyenda-aislamiento-contenido')
    expect(bloque.textContent).toContain('Muy bajo: 5')
    expect(bloque.textContent).toContain('Bajo: 3')
    expect(bloque.textContent).toContain('Medio: 2')
    expect(bloque.textContent).toContain('Alto: 1')
    expect(bloque.textContent).toContain('Sin conexión a la red OSM: 4')
    expect(bloque.textContent).toContain('Sin cobertura OSM: 7')
    // Un ícono por cada nivel (5) — la fila "sin cobertura" no lleva ícono.
    expect(bloque.querySelectorAll('img')).toHaveLength(5)
    expect(bloque.textContent).toContain('extracto 2026-06-01')
  })

  it('incluye el descargo de que no es pronóstico', () => {
    renderLeyenda()
    expect(
      screen.getByTestId('leyenda-aislamiento-contenido').textContent,
    ).toContain('No es pronóstico ni estado del edificio')
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

    rerender(
      <LeyendaAccesos
        visibles={visibles(['aislamiento'])}
        territorio={null}
        territorioLoading={false}
        territorioError="boom"
        resumen={null}
        seleccion={null}
        geometria={null}
        geometriaLoading={false}
        geometriaError={null}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('boom')

    rerender(
      <LeyendaAccesos
        visibles={visibles(['aislamiento'])}
        territorio={null}
        territorioLoading={false}
        territorioError={null}
        resumen={resumen}
        seleccion={null}
        geometria={null}
        geometriaLoading={false}
        geometriaError={null}
      />,
    )
    expect(screen.getByTestId('leyenda-aislamiento-sin-datos')).toHaveTextContent(
      'Sin datos importados de OSM.',
    )
  })
})

// ---------------------------------------------------------------------------
// Leyenda — inundación
// ---------------------------------------------------------------------------

describe('LeyendaAccesos — inundación', () => {
  it('muestra período de retorno, filas por clase, filas no dibujadas y descargo', () => {
    renderLeyenda({ visibles: visibles(['inundacion']) })
    const bloque = screen.getByTestId('leyenda-inundacion-contenido')
    expect(bloque.textContent).toContain('período de retorno de 100 años')
    expect(bloque.textContent).toContain('escenario histórico')
    expect(bloque.textContent).toContain('< 0,5 m: 4')
    expect(bloque.textContent).toContain('0,5 – 1 m: 5')
    expect(bloque.textContent).toContain('≥ 1 m: 6')
    expect(bloque.textContent).toContain('Sin profundidad estimada (0 m): 3')
    expect(bloque.textContent).toContain('Sin cobertura physrisk: 2')
    expect(bloque.textContent).toContain('no es un pronóstico ni el trazado de un río')
    expect(bloque.textContent).toContain('OS-Climate physrisk (Apache-2.0) · corrida 2026-05-15')
  })

  it('muestra falta de datos importados de physrisk', () => {
    renderLeyenda({ visibles: visibles(['inundacion']), territorio: null, resumen })
    expect(screen.getByTestId('leyenda-inundacion-sin-datos')).toHaveTextContent(
      'Sin datos importados de physrisk.',
    )
  })
})

// ---------------------------------------------------------------------------
// Leyenda — ruta
// ---------------------------------------------------------------------------

describe('LeyendaAccesos — ruta', () => {
  it('sin selección pide elegir una escuela', () => {
    renderLeyenda({ visibles: visibles(['rutaSeleccion']) })
    expect(screen.getByTestId('leyenda-ruta-sin-seleccion')).toHaveTextContent(
      'Seleccioná una escuela para ver su ruta de acceso OSM.',
    )
  })

  it('muestra carga y error', () => {
    const { rerender } = renderLeyenda({
      visibles: visibles(['rutaSeleccion']),
      seleccion: { nombre: 'Escuela Uno' },
      geometriaLoading: true,
    })
    expect(screen.getByTestId('leyenda-ruta-cargando')).toHaveTextContent('Cargando ruta de acceso…')

    rerender(
      <LeyendaAccesos
        visibles={visibles(['rutaSeleccion'])}
        territorio={territorio}
        territorioLoading={false}
        territorioError={null}
        resumen={resumen}
        seleccion={{ nombre: 'Escuela Uno' }}
        geometria={null}
        geometriaLoading={false}
        geometriaError="falló"
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('falló')
  })

  it('traduce cada motivo de indisponibilidad', () => {
    const motivos: Array<[string, string]> = [
      ['sin_geometria_importada', 'La geometría de accesos no está importada para esta escuela.'],
      ['sin_conexion_red', 'La escuela no conecta con la red vial OSM: no hay ruta calculada.'],
      ['ruta_degenerada', 'La escuela está junto a la cabecera departamental: no hay ruta que dibujar.'],
      ['otro', 'Sin geometría de acceso para esta escuela.'],
    ]
    for (const [motivo, texto] of motivos) {
      const { unmount } = renderLeyenda({
        visibles: visibles(['rutaSeleccion']),
        seleccion: { nombre: 'Escuela Uno' },
        geometria: { cueAnexo: '1801605-04', disponible: false, motivo },
      })
      expect(screen.getByTestId('leyenda-ruta-motivo')).toHaveTextContent(texto)
      unmount()
    }
  })

  it('disponible lista los cruces, avisa cuando no hay y encuadra con el botón', async () => {
    const onEncuadrarRuta = vi.fn()
    renderLeyenda({
      visibles: visibles(['rutaSeleccion']),
      seleccion: { nombre: 'Escuela Uno' },
      geometria: geometriaDisponible,
      onEncuadrarRuta,
    })
    const bloque = screen.getByTestId('leyenda-ruta-disponible')
    expect(bloque.textContent).toContain('Ruta de acceso OSM · Escuela Uno')
    expect(bloque.textContent).toContain('Sin cruces de agua en esta ruta')
    expect(bloque.textContent).toContain('no es pronóstico ni estado confirmado del edificio')
    expect(bloque.textContent).toContain('extracto 2026-06-01')

    await userEvent.click(screen.getByRole('button', { name: 'Encuadrar ruta' }))
    expect(onEncuadrarRuta).toHaveBeenCalledTimes(1)
  })

  it('disponible con cruces muestra los conteos y oculta el aviso de sin cruces', () => {
    renderLeyenda({
      visibles: visibles(['rutaSeleccion']),
      seleccion: { nombre: 'Escuela Uno' },
      geometria: {
        ...geometriaDisponible,
        resumen: { puente: 2, vado: 1, sinEvidencia: 3 },
      },
    })
    const bloque = screen.getByTestId('leyenda-ruta-disponible')
    expect(bloque.textContent).toContain('Puente: 2')
    expect(bloque.textContent).toContain('Vado: 1')
    expect(bloque.textContent).toContain('Sin evidencia de puente: 3')
    expect(bloque.textContent).not.toContain('Sin cruces de agua en esta ruta')
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
  it('listas las tres capas y notifica el toggle', async () => {
    const onChange = vi.fn()
    render(
      <AccesosLayerControl
        capas={{ aislamiento: false, inundacion: false, rutaSeleccion: false }}
        onChange={onChange}
      />,
    )
    expect(screen.getByText('Capas territoriales')).toBeInTheDocument()
    expect(
      screen.getByRole('checkbox', { name: CAPAS_ACCESOS_LABELS.aislamiento }),
    ).not.toBeChecked()

    await userEvent.click(
      screen.getByRole('checkbox', { name: CAPAS_ACCESOS_LABELS.aislamiento }),
    )
    expect(onChange).toHaveBeenCalledWith('aislamiento', true)
  })
})
