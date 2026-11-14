// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { forwardRef, useEffect, useImperativeHandle, type JSX, type ReactNode } from 'react'
import MapInfraestructuraPage from '@/components/mapas/map-infraestructura-page'

// Base de datos vacía en modo Radar: la pestaña tiene que montar y mostrar el
// estado vacío. Los payloads son los que devuelven las rutas sin corridas.
const MAPA_MOCK = vi.hoisted(() => ({
  fuentes: {} as Record<string, unknown>,
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
    onLoad?: () => void
  }>(function MapGL(props, ref) {
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
    Layer: (props: { id?: string }) => <div data-testid={`mock-layer-${props.id}`} />,
    Source: (props: { id?: string; data?: unknown; children?: ReactNode }) => {
      if (props.id) MAPA_MOCK.fuentes[props.id] = props.data
      return <>{props.children}</>
    },
    Marker: (props: { children?: ReactNode }) => <>{props.children ?? null}</>,
    Popup: (props: { children?: ReactNode }) => <>{props.children ?? null}</>,
    useMap: () => ({ current: undefined }),
  }
})

const RESPUESTA_RADAR_VACIA = {
  corte: null,
  cobertura: null,
  departamentos: [],
  puntos: [],
  escuelas: { items: [], page: 1, pageSize: 25, total: 0, totalPages: 0 },
  kpis: {
    riesgoAltoTotal: 0,
    sinEvidenciaTotal: 0,
    accesoCondicionado: { escuelas: 0, matricula: 0 },
  },
  hayNivelProvisorio: false,
}

const RESPUESTA_RADAR_METEO_VACIA = {
  runId: null,
  runAt: null,
  fetchedAt: null,
  model: null,
  gridVersion: 'v1',
  grid: null,
  tiempos: [],
  unidades: {},
  valores: {},
  frescura: null,
  sinDatos: true,
  razon: 'Todavía no se cargó ningún pronóstico.',
}

const RESPUESTA_RESUMEN_METEO_VACIA = {
  runId: null,
  dias: [],
  departamentos: [],
  umbrales: {},
  alertasSmn: [],
  verificacion: { estado: 'sin_datos' },
  ensamble: null,
  sinDatos: true,
  razon: 'Todavía no se cargó ningún pronóstico.',
}

function respuesta(cuerpo: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => cuerpo }
}

// Rutas tal como responde la base vacía: departamentos sin publicar (503),
// observado sin features, estaciones con error interno y radar sin corrida.
function responderBaseVacia() {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.startsWith('/api/mapas/infraestructura/datasets/departamentos')) {
      return respuesta({ error: 'Dataset sin publicar' }, false, 503)
    }
    if (url.startsWith('/api/infraestructura/peligro/observado-grilla')) {
      return respuesta({ geojson: { type: 'FeatureCollection', features: [] } })
    }
    if (url.startsWith('/api/infraestructura/hidrometria/estaciones')) {
      return respuesta({ error: 'Error interno' }, false, 500)
    }
    if (url.startsWith('/api/infraestructura/radar-meteo/resumen')) {
      return respuesta(RESPUESTA_RESUMEN_METEO_VACIA)
    }
    if (url.startsWith('/api/infraestructura/radar-meteo')) {
      return respuesta(RESPUESTA_RADAR_METEO_VACIA)
    }
    if (url.startsWith('/api/infraestructura/radar')) {
      return respuesta(RESPUESTA_RADAR_VACIA)
    }
    return respuesta({ error: 'no mock' }, false, 503)
  }))
}

const GEOJSON_DEPARTAMENTOS = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/departamentos-corrientes-georef-2026-09-27.geojson'), 'utf8'),
)

// Un mapa mínimo que MapLibre "tiene" (todas las capas existen) para que el
// radar registre sus capas de borde, etiqueta y máscara.
function mapaListo() {
  return {
    getZoom: () => 7,
    on: vi.fn(),
    off: vi.fn(),
    getLayer: () => ({}),
  }
}

async function renderPaginaRadar() {
  render(
    <MapInfraestructuraPage
      mostrarEnlaceNominal={false}
      escuelasMapa={null}
      pestana="radar"
      riskRadarEnabled
    />,
  )
  await act(async () => { await Promise.resolve() })
  await act(async () => { await Promise.resolve() })
  await act(async () => { await new Promise((resolver) => setTimeout(resolver, 0)) })
}

beforeEach(() => {
  MAPA_MOCK.fuentes = {}
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('MapInfraestructuraPage en Radar con base vacía', () => {
  it('monta la pestaña Radar sin lanzar y muestra el estado vacío', async () => {
    responderBaseVacia()

    await renderPaginaRadar()

    expect(screen.getByTestId('mock-maplibre')).toBeInTheDocument()
    expect(screen.queryByText(/algo salió mal/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/This page couldn/i)).not.toBeInTheDocument()
    const fuenteDepartamentos = MAPA_MOCK.fuentes['infra-departamentos-src'] as { features: unknown[] } | undefined
    expect(fuenteDepartamentos?.features ?? []).toHaveLength(0)
  })

  it('con departamentos publicados, la máscara inversa del radar se arma a partir del GeoJSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.startsWith('/api/mapas/infraestructura/datasets/departamentos')) {
        return respuesta(GEOJSON_DEPARTAMENTOS)
      }
      if (url.startsWith('/api/infraestructura/radar-meteo/resumen')) {
        return respuesta(RESPUESTA_RESUMEN_METEO_VACIA)
      }
      if (url.startsWith('/api/infraestructura/radar-meteo')) {
        return respuesta(RESPUESTA_RADAR_METEO_VACIA)
      }
      if (url.startsWith('/api/infraestructura/radar')) {
        return respuesta(RESPUESTA_RADAR_VACIA)
      }
      return respuesta({ geojson: { type: 'FeatureCollection', features: [] } })
    }))

    await renderPaginaRadar()
    await act(async () => {
      window.dispatchEvent(new CustomEvent('radar-meteo-map-ready', { detail: mapaListo() }))
    })
    await act(async () => { await Promise.resolve() })

    const mascara = MAPA_MOCK.fuentes['radar-meteo-inverse-mask-source'] as
      | { type: string; features: Array<{ geometry: { type: string; coordinates: unknown[] } }> }
      | undefined
    expect(mascara?.type).toBe('FeatureCollection')
    expect(mascara?.features).toHaveLength(1)
    expect(mascara?.features[0].geometry.type).toBe('Polygon')
  })
})
