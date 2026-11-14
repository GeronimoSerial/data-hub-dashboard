// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { forwardRef, useEffect, useImperativeHandle, type JSX, type ReactNode } from 'react'
import { cargarRegion } from '@/lib/infraestructura/region/registro'
import { regionPublica } from '@/lib/infraestructura/region/esquema'
import MapInfraestructuraPage from '@/components/mapas/map-infraestructura-page'

// Región manaos con la base vacía: sin departamentos publicados el mapa abre
// con la vista inicial de la región en el formato de MapLibre
// ({ longitude, latitude, zoom }), no con { center, zoom }.
const MAPA_MOCK = vi.hoisted(() => ({
  viewState: null as Record<string, unknown> | null,
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

vi.mock('react-map-gl/maplibre', () => {
  const MapGL = forwardRef<unknown, {
    children?: ReactNode
    initialViewState?: Record<string, unknown>
    onLoad?: () => void
  }>(function MapGL(props, ref) {
    MAPA_MOCK.viewState = props.initialViewState ?? null
    useImperativeHandle(ref, () => ({
      getMap: () => ({
        fitBounds: vi.fn(),
        flyTo: vi.fn(),
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
    Layer: () => null,
    Source: (props: { children?: ReactNode }) => <>{props.children}</>,
    Marker: (props: { children?: ReactNode }) => <>{props.children ?? null}</>,
    Popup: (props: { children?: ReactNode }) => <>{props.children ?? null}</>,
    useMap: () => ({ current: undefined }),
  }
})

beforeEach(() => {
  MAPA_MOCK.viewState = null
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('MapInfraestructuraPage región manaos sin datasets publicados', () => {
  it('abre en la vista inicial de manaos como longitude/latitude/zoom concretos', async () => {
    const manaos = regionPublica(cargarRegion('manaos'))

    render(
      <MapInfraestructuraPage
        region={manaos}
        mostrarEnlaceNominal={false}
        escuelasMapa={null}
        pestana="actual"
      />,
    )
    await act(async () => { await Promise.resolve() })
    await act(async () => { await Promise.resolve() })

    expect(MAPA_MOCK.viewState).toEqual({ longitude: -60.02, latitude: -3.12, zoom: 9 })
  })
})
