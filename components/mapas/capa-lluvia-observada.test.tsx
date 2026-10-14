// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { CapaLluviaObservada, CLASES_LLUVIA, pintarGrillaLluvia } from './capa-lluvia-observada'

const mapa = vi.hoisted(() => ({ on: vi.fn(), off: vi.fn(), getCanvas: vi.fn(() => ({ style: {} })) }))

vi.mock('react-map-gl/maplibre', () => ({
  Source: ({ id, children }: { id: string; children: React.ReactNode }) => <div data-testid="source" data-id={id}>{children}</div>,
  Layer: (props: Record<string, unknown>) => <div data-testid="layer" data-props={JSON.stringify(props)} />,
  Popup: ({ children }: { children: React.ReactNode }) => <div data-testid="popup">{children}</div>,
  useMap: () => ({ current: mapa }),
}))

const CELDA_PARCIAL = { geometryRef: 'b', acumuladoMm: 12, granulos: 100, esperados: 144, cobertura: 69.4, parcial: true }

const RESPUESTA = {
  horas: 72,
  desde: '2026-10-10T00:00:00Z',
  hasta: '2026-10-13T00:00:00Z',
  fuente: 'NASA IMERG Early',
  geojson: {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: { type: 'Polygon', coordinates: [] }, properties: { geometryRef: '-27.4_-58.8', acumuladoMm: 30, granulos: 144, esperados: 144, cobertura: 100, parcial: false } },
      { type: 'Feature', geometry: { type: 'Polygon', coordinates: [] }, properties: CELDA_PARCIAL },
    ],
  },
}

function pixel(grilla: { ancho: number; datos: Uint8ClampedArray }, fila: number, columna: number): number[] {
  const indice = (fila * grilla.ancho + columna) * 4
  return Array.from(grilla.datos.slice(indice, indice + 4))
}

describe('pintarGrillaLluvia', () => {
  // Grilla de 2 columnas x 15 filas: lon -58,8..-58,7 y lat -26,0..-27,4.
  const celdas = [
    { geometryRef: '-27.4_-58.8', acumuladoMm: 30 },
    { geometryRef: '-27.4_-58.7', acumuladoMm: 0.5 },
    { geometryRef: '-26.9_-58.8', acumuladoMm: 30 },
    { geometryRef: '-26.0_-58.8', acumuladoMm: 30 },
  ]

  it('pinta una celda de 30 mm con el color de su clase y alfa completo dentro de la región', () => {
    const grilla = pintarGrillaLluvia(celdas)

    expect(grilla.ancho).toBe(2)
    expect(grilla.alto).toBe(15)
    expect(pixel(grilla, 14, 0)).toEqual([96, 165, 250, 191])
  })

  it('deja transparente una celda menor a 1 mm', () => {
    const grilla = pintarGrillaLluvia(celdas)

    expect(pixel(grilla, 14, 1)[3]).toBe(0)
  })

  it('reduce el alfa a 0,3° al sur de la región (factor 0,25) y lo anula a 1,2° de distancia', () => {
    const grilla = pintarGrillaLluvia(celdas)

    expect(pixel(grilla, 9, 0)[3]).toBe(48)
    expect(pixel(grilla, 0, 0)[3]).toBe(0)
  })

  it('usa los bordes exteriores de las celdas extremas como esquinas en orden norte-oeste, norte-este, sur-este, sur-oeste', () => {
    const { coordenadas } = pintarGrillaLluvia(celdas)

    const esperadas = [
      [-58.85, -25.95],
      [-58.65, -25.95],
      [-58.65, -27.45],
      [-58.85, -27.45],
    ]
    expect(coordenadas).toHaveLength(4)
    coordenadas?.forEach((esquina, indice) => {
      expect(esquina[0]).toBeCloseTo(esperadas[indice][0], 10)
      expect(esquina[1]).toBeCloseTo(esperadas[indice][1], 10)
    })
  })

  it('devuelve una grilla vacía cuando no hay celdas', () => {
    expect(pintarGrillaLluvia([])).toEqual({ ancho: 0, alto: 0, datos: new Uint8ClampedArray(0), coordenadas: null })
  })
})

describe('CapaLluviaObservada', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(RESPUESTA) }))
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      createImageData: (ancho: number, alto: number) => ({ data: new Uint8ClampedArray(ancho * alto * 4) }),
      putImageData: vi.fn(),
    } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,TEST')
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    mapa.on.mockClear()
    mapa.off.mockClear()
  })

  it('no renderiza nada ni pide datos cuando la capa está apagada', () => {
    const { container } = render(<CapaLluviaObservada visible={false} horas={72} />)

    expect(container.innerHTML).toBe('')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('pide la ventana de 72 horas y renderiza la imagen rasterizada sin bordes ni contornos', async () => {
    render(<CapaLluviaObservada visible horas={72} />)

    await waitFor(() => expect(screen.getAllByTestId('source').length).toBeGreaterThan(0))
    expect(fetchMock.mock.calls[0][0]).toBe('/api/infraestructura/peligro/observado-grilla?horas=72')
    const fuentes = screen.getAllByTestId('source').map((nodo) => nodo.getAttribute('data-id'))
    expect(fuentes).toEqual(['lluvia-observada-src', 'lluvia-observada-hit-src'])
    const capas = screen.getAllByTestId('layer').map((nodo) => JSON.parse(nodo.getAttribute('data-props') ?? '{}'))
    expect(capas.map((capa) => capa.type)).toEqual(['raster', 'fill'])
    expect(capas[0].paint).toEqual({ 'raster-opacity': 0.65, 'raster-resampling': 'linear', 'raster-fade-duration': 0 })
    expect(capas[1].id).toBe('lluvia-observada-hit')
    expect(capas[1].paint).toEqual({ 'fill-opacity': 0 })
  })

  it('no dibuja la imagen cuando el navegador no ofrece contexto 2D, pero conserva la capa de valores', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    render(<CapaLluviaObservada visible horas={72} />)

    await waitFor(() => expect(screen.getAllByTestId('source').length).toBeGreaterThan(0))
    expect(screen.getAllByTestId('source').map((nodo) => nodo.getAttribute('data-id'))).toEqual(['lluvia-observada-hit-src'])
  })

  it('vuelve a pedir los datos al cambiar la ventana a 24 horas y avisa la fecha de corte y las celdas parciales', async () => {
    const onMeta = vi.fn()
    const { rerender } = render(<CapaLluviaObservada visible horas={72} onMeta={onMeta} />)
    await waitFor(() => expect(onMeta).toHaveBeenCalledWith({ hasta: '2026-10-13T00:00:00Z', horas: 72, parciales: 1 }))

    rerender(<CapaLluviaObservada visible horas={24} onMeta={onMeta} />)
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith('/api/infraestructura/peligro/observado-grilla?horas=24', expect.anything()))
  })

  it('ignora errores de red sin romper el mapa', async () => {
    fetchMock.mockImplementation(() => Promise.reject(new Error('red')))
    const { container } = render(<CapaLluviaObservada visible horas={24} />)

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(container.querySelector('[data-testid="source"]')).toBeNull()
  })

  it('registra clic y cursor sobre la capa de valores y muestra el valor de la celda con su ventana', async () => {
    render(<CapaLluviaObservada visible horas={72} />)
    await waitFor(() => expect(screen.getAllByTestId('source').length).toBeGreaterThan(0))

    const manejadorClic = mapa.on.mock.calls.find((llamada) => llamada[0] === 'click' && llamada[1] === 'lluvia-observada-hit')?.[2]
    expect(manejadorClic).toBeTypeOf('function')
    expect(mapa.on.mock.calls.map((llamada) => llamada[0])).toEqual(expect.arrayContaining(['mouseenter', 'mouseleave']))

    act(() => {
      manejadorClic({
        lngLat: { lng: -58.8, lat: -27.4 },
        features: [{ properties: CELDA_PARCIAL }],
      })
    })

    const popup = await screen.findByTestId('popup')
    expect(popup.textContent).toContain('Lluvia observada 72 h: 12,0 mm')
    expect(popup.textContent).toContain('Ventana: ')
    expect(popup.textContent).toContain('Ventana incompleta: 100/144 gránulos (cobertura 69 %) — el valor puede subestimar la lluvia.')
  })

  it('quita los listeners del mapa al desmontar', async () => {
    const { unmount } = render(<CapaLluviaObservada visible horas={72} />)
    await waitFor(() => expect(screen.getAllByTestId('source').length).toBeGreaterThan(0))

    unmount()
    expect(mapa.off.mock.calls.map((llamada) => llamada[0])).toEqual(expect.arrayContaining(['click', 'mouseenter', 'mouseleave']))
  })

  it('expone las clases de lluvia con su umbral y etiqueta en orden creciente', () => {
    expect(CLASES_LLUVIA.map((clase) => clase.desde)).toEqual([1, 10, 25, 50, 100, 150])
    expect(CLASES_LLUVIA[0]).toEqual({ desde: 1, color: '#dbeafe', etiqueta: '1–10 mm' })
    expect(CLASES_LLUVIA[5].etiqueta).toBe('150 mm o más')
  })
})
