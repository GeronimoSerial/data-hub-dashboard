// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, cleanup, render, screen } from '@testing-library/react'
import { forwardRef, useEffect, useImperativeHandle, type JSX, type ReactNode } from 'react'
import { LIMITES_CORRIENTES } from '@/lib/mapas/departamentos'
import { regionPublicaActual } from '@/lib/infraestructura/region/publica'
import MapInfraestructuraPage from '@/components/mapas/map-infraestructura-page'

// Región sin datasets publicados (manaos, o cualquier región nueva antes de su
// primera carga): los GeoJSON de departamentos y máscara responden 503 y el
// mapa tiene que montarse igual, con la vista inicial de la región.
const MAPA_MOCK = vi.hoisted(() => ({
  viewState: null as Record<string, unknown> | null,
  fuentes: {} as Record<string, unknown>,
  capas: [] as string[],
  fitBounds: vi.fn(),
  flyTo: vi.fn(),
}))

vi.mock('@/lib/map-worker', () => ({ ensureMapWorker: () => {} }))

vi.mock('@/lib/infraestructura/use-alertas', () => ({
  useAlertas: () => ({
    data: {
      partes: [],
      indicadores: {
        escuelas: 0,
        conServicioSuspendido: 0,
        conServicioParcial: 0,
        evacuadas: 0,
        establecimientosParciales: 0,
        centrosDeEvacuados: 0,
        sinActualizar: 0,
        alumnosAlcanzados: 0,
        seccionesAlcanzadas: 0,
      },
    },
    loading: false,
    error: null,
  }),
}))

vi.mock('@/components/mapas/ficha-escuela-panel', () => ({
  FichaEscuelaPanel: (): JSX.Element => <section data-testid="mock-ficha-escuela" />,
}))

// `Source`/`Layer` del doble registran lo que el componente pasa: el `data` de
// cada fuente y las capas montadas. El doble de MapGL expone `initialViewState`
// (lo que MapLibre usaría para el encuadre inicial) y un `getMap()` mínimo.
vi.mock('react-map-gl/maplibre', () => {
  const MapGL = forwardRef<unknown, {
    children?: ReactNode
    initialViewState?: Record<string, unknown>
    onLoad?: () => void
  }>(function MapGL(props, ref) {
    MAPA_MOCK.viewState = props.initialViewState ?? null
    useImperativeHandle(ref, () => ({
      getMap: () => ({
        fitBounds: MAPA_MOCK.fitBounds,
        flyTo: MAPA_MOCK.flyTo,
        easeTo: vi.fn(),
        getZoom: () => 7,
        getCenter: () => ({ lng: 0, lat: 0 }),
        getBearing: () => 0,
        getPitch: () => 0,
        getLayer: () => undefined,
        getContainer: () => document.createElement('div'),
        getSource: () => undefined,
        resize: vi.fn(),
        stop: vi.fn(),
        isStyleLoaded: () => true,
        on: vi.fn(),
        off: vi.fn(),
        hasImage: () => true,
        addImage: vi.fn(),
        querySourceFeatures: () => [],
      }),
    }), [])
    useEffect(() => {
      props.onLoad?.()
      // eslint-disable-next-line react-hooks/exhaustive-deps -- como el evento real de MapLibre: una vez al montar
    }, [])
    return <div data-testid="mock-maplibre">{props.children}</div>
  })
  return {
    __esModule: true,
    default: MapGL,
    AttributionControl: () => null,
    Layer: (props: { id?: string }) => {
      if (props.id) MAPA_MOCK.capas.push(props.id)
      return <div data-testid={`mock-layer-${props.id}`} />
    },
    Source: (props: { id?: string; data?: unknown; children?: ReactNode }) => {
      if (props.id) MAPA_MOCK.fuentes[props.id] = props.data
      return <>{props.children}</>
    },
    Marker: (props: { children?: ReactNode }) => <>{props.children ?? null}</>,
    Popup: (props: { children?: ReactNode }) => <>{props.children ?? null}</>,
    useMap: () => ({ current: undefined }),
  }
})

const GEOJSON_DEPARTAMENTOS = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/departamentos-corrientes-georef-2026-09-27.geojson'), 'utf8'),
)

function responderConDatasets() {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => GEOJSON_DEPARTAMENTOS }))
}

function responderSinDatasets() {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) }))
}

async function renderPagina() {
  render(
    <MapInfraestructuraPage
      mostrarEnlaceNominal={false}
      escuelasMapa={null}
      pestana="actual"
    />,
  )
  await act(async () => { await Promise.resolve() })
  await act(async () => { await Promise.resolve() })
}

beforeEach(() => {
  MAPA_MOCK.viewState = null
  MAPA_MOCK.fuentes = {}
  MAPA_MOCK.capas = []
  MAPA_MOCK.fitBounds.mockClear()
  MAPA_MOCK.flyTo.mockClear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('MapInfraestructuraPage sin datasets publicados', () => {
  it('con departamentos y máscara en 503 monta el mapa igual, sin error boundary ni capas de departamentos', async () => {
    responderSinDatasets()

    await renderPagina()

    expect(screen.getByTestId('mock-maplibre')).toBeInTheDocument()
    expect(screen.queryByText(/algo salió mal/i)).not.toBeInTheDocument()
    expect(screen.queryByText('Cargando datos del mapa…')).not.toBeInTheDocument()
    const fuenteDepartamentos = MAPA_MOCK.fuentes['infra-departamentos-src'] as { features: unknown[] }
    expect(fuenteDepartamentos.features).toHaveLength(0)
  })

  it('sin datasets, el encuadre inicial es la vista de la región y no un fitBounds sobre el GeoJSON', async () => {
    responderSinDatasets()

    await renderPagina()

    const vista = regionPublicaActual().vistaInicial
    expect(MAPA_MOCK.viewState).toEqual({ longitude: vista.centro[0], latitude: vista.centro[1], zoom: vista.zoom })
    expect(MAPA_MOCK.viewState).not.toHaveProperty('bounds')
  })
})

describe('MapInfraestructuraPage con datasets publicados', () => {
  it('encuadra en los límites de los departamentos y agrega la capa de departamentos', async () => {
    responderConDatasets()

    await renderPagina()

    expect(screen.getByTestId('mock-maplibre')).toBeInTheDocument()
    expect(MAPA_MOCK.viewState).toMatchObject({ bounds: LIMITES_CORRIENTES })
    expect(MAPA_MOCK.capas).toContain('infra-departamentos-relleno')
    expect(MAPA_MOCK.capas).toContain('infra-mascara-provincia')
  })
})
