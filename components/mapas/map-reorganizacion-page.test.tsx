// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { forwardRef, useEffect, useImperativeHandle, type ReactNode } from 'react'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { LIMITES_CORRIENTES } from '@/lib/mapas/departamentos'
import { BASEMAPS } from '@/lib/map-types'

const { MAPA, ESTADO_DATOS, RECARGAS, MAPGL } = vi.hoisted(() => ({
  MAPA: { resize: vi.fn(), fitBounds: vi.fn(), stop: vi.fn() },
  MAPGL: { props: {} as Record<string, unknown> },
  ESTADO_DATOS: {
    valor: { estado: 'listo', dataset: undefined, mensaje: undefined } as {
      estado: 'cargando' | 'listo' | 'error' | 'sin_permiso'
      dataset?: unknown
      mensaje?: string
    },
  },
  RECARGAS: { reintentar: vi.fn() },
}))

vi.mock('@/lib/map-worker', () => ({ ensureMapWorker: () => {} }))

vi.mock('@/components/mapas/reorganizacion/use-dataset-reorganizacion', () => ({
  useDatasetReorganizacion: () => ({ ...ESTADO_DATOS.valor, reintentar: RECARGAS.reintentar }),
}))

vi.mock('react-map-gl/maplibre', () => {
  // El componente guarda `mapRef` y lo pasa a <MapGL>; el doble expone
  // `getMap()` con los espías de MAPA y dispara `onLoad` una vez montado,
  // como lo hace MapLibre al cargar el estilo.
  const MapGL = forwardRef<unknown, { children?: ReactNode; onLoad?: () => void }>(function MapGL(props, ref) {
    MAPGL.props = props as Record<string, unknown>
    useImperativeHandle(ref, () => ({ getMap: () => MAPA }))
    useEffect(() => {
      props.onLoad?.()
    }, [])
    return <div data-testid="mapgl">{props.children}</div>
  })
  return {
    __esModule: true,
    default: MapGL,
    Source: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    Layer: () => null,
    NavigationControl: () => null,
  }
})

import MapReorganizacionPage from './map-reorganizacion-page'

beforeEach(() => {
  MAPA.resize.mockReset()
  MAPA.fitBounds.mockReset()
  MAPA.stop.mockReset()
  RECARGAS.reintentar.mockReset()
  ESTADO_DATOS.valor = { estado: 'listo', dataset: undefined, mensaje: undefined }
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('MapReorganizacionPage', () => {
  it('encuadra la provincia al cargar el estilo', () => {
    render(<MapReorganizacionPage />)

    expect(MAPA.fitBounds).toHaveBeenCalledTimes(1)
    expect(MAPA.fitBounds).toHaveBeenCalledWith(
      LIMITES_CORRIENTES,
      expect.objectContaining({ duration: 0, padding: expect.objectContaining({ left: 24 }) }),
    )
  })

  it('suma el espacio del panel al padding del encuadre', () => {
    render(<MapReorganizacionPage paddingEncuadre={{ left: 340 }} />)

    expect(MAPA.fitBounds).toHaveBeenCalledWith(
      LIMITES_CORRIENTES,
      expect.objectContaining({ padding: expect.objectContaining({ left: 364, top: 24 }) }),
    )
  })

  it('reencuadra la primera vez que se muestra y no al volver a mostrarse', () => {
    const { rerender } = render(<MapReorganizacionPage visible={false} />)
    expect(MAPA.fitBounds).toHaveBeenCalledTimes(1)
    expect(MAPA.stop).toHaveBeenCalled()

    rerender(<MapReorganizacionPage visible />)
    expect(MAPA.fitBounds).toHaveBeenCalledTimes(2)

    rerender(<MapReorganizacionPage visible={false} />)
    rerender(<MapReorganizacionPage visible />)
    expect(MAPA.fitBounds).toHaveBeenCalledTimes(2)
  })

  it('"Volver a Corrientes" vuelve a encuadrar la provincia', () => {
    render(<MapReorganizacionPage />)
    MAPA.fitBounds.mockClear()

    fireEvent.click(screen.getByRole('button', { name: 'Volver a Corrientes' }))

    expect(MAPA.fitBounds).toHaveBeenCalledTimes(1)
    expect(MAPA.fitBounds).toHaveBeenCalledWith(LIMITES_CORRIENTES, expect.any(Object))
  })

  it('muestra el estado de carga sin desmontar el mapa', () => {
    ESTADO_DATOS.valor = { estado: 'cargando' }
    render(<MapReorganizacionPage />)

    expect(screen.getByRole('status')).toHaveTextContent('Cargando datos del mapa…')
    expect(screen.getByTestId('mapgl')).toBeInTheDocument()
  })

  it('muestra el error con un botón para reintentar', () => {
    ESTADO_DATOS.valor = { estado: 'error', mensaje: 'No se pudieron cargar los datos del mapa.' }
    render(<MapReorganizacionPage />)

    const alerta = screen.getByRole('alert')
    expect(alerta).toHaveTextContent('No se pudieron cargar los datos del mapa.')
    fireEvent.click(within(alerta).getByRole('button', { name: 'Reintentar' }))

    expect(RECARGAS.reintentar).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('mapgl')).toBeInTheDocument()
  })

  it('muestra el estado sin permiso sin botón de reintento', () => {
    ESTADO_DATOS.valor = { estado: 'sin_permiso', mensaje: 'No tiene acceso a este mapa' }
    render(<MapReorganizacionPage />)

    const alerta = screen.getByRole('alert')
    expect(alerta).toHaveTextContent('No tiene acceso a este mapa')
    expect(within(alerta).queryByRole('button', { name: 'Reintentar' })).toBeNull()
  })

  it('renderiza el panel y lo pliega con el botón de su control', () => {
    render(<MapReorganizacionPage panel={<p>Indicadores</p>} />)

    const boton = screen.getByRole('button', { name: 'Ocultar panel' })
    expect(boton).toHaveAttribute('aria-expanded', 'true')
    const panel = screen.getByRole('complementary', { hidden: true })
    expect(panel).toBeVisible()

    fireEvent.click(boton)

    expect(screen.getByRole('button', { name: 'Mostrar panel' })).toHaveAttribute('aria-expanded', 'false')
    expect(panel).not.toBeVisible()
    expect(screen.getByText('Indicadores')).toBeInTheDocument()
  })

  it('pasa las capas interactivas y el clic al mapa', () => {
    const alClic = vi.fn()
    render(<MapReorganizacionPage interactiveLayerIds={['capa-a']} onMapClick={alClic} />)

    expect(MAPGL.props.interactiveLayerIds).toEqual(['capa-a'])
    expect(MAPGL.props.onClick).toBe(alClic)
  })

  it('usa puntero sólo con el mouse sobre una capa interactiva', () => {
    render(<MapReorganizacionPage interactiveLayerIds={['capa-a']} />)
    const mover = MAPGL.props.onMouseMove as (e: { features?: unknown[] }) => void

    act(() => mover({ features: [{}] }))
    expect(MAPGL.props.cursor).toBe('pointer')

    act(() => mover({ features: [] }))
    expect(MAPGL.props.cursor).toBeUndefined()
  })

  it('sin capas interactivas no cambia el puntero ni registra el movimiento', () => {
    render(<MapReorganizacionPage />)

    expect(MAPGL.props.interactiveLayerIds).toBeUndefined()
    expect(MAPGL.props.onMouseMove).toBeUndefined()
  })

  it('usa el estilo vial por defecto y cambia el estilo base con mapStyle', () => {
    const { unmount } = render(<MapReorganizacionPage />)
    expect(MAPGL.props.mapStyle).toBe(BASEMAPS.voyager.styleUrl)
    unmount()

    render(<MapReorganizacionPage mapStyle="https://estilo.test/satelite.json" />)
    expect(MAPGL.props.mapStyle).toBe('https://estilo.test/satelite.json')
  })
})
