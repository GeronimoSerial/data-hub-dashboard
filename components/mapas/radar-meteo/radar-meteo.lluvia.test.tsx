// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import type { RespuestaRadarMeteo } from '@/lib/infraestructura/radar-meteo/use-radar-meteo'
import { colorLluvia, rgbaComoCss } from './escalas'
import fixtureJson from './radar-meteo-real-reducido.fixture.json'

// El fixture conserva la forma real reducida de la respuesta documentada por este contrato.
const fixture = fixtureJson as RespuestaRadarMeteo

const mapaMock = vi.hoisted(() => ({
  sources: new Map<string, Record<string, unknown>>(),
  layers: new Map<string, Record<string, unknown>>(),
  listeners: new Map<string, Set<() => void>>(),
}))

vi.mock('@/lib/infraestructura/radar-meteo/use-radar-meteo', () => ({
  useRadarMeteo: () => ({ data: fixture, loading: false, error: null }),
}))

vi.mock('@/lib/infraestructura/radar-meteo/use-corridas-radar-meteo', () => ({
  useCorridasRadarMeteo: () => ({ data: null, loading: false, error: null }),
}))

vi.mock('react-map-gl/maplibre', async () => {
  const React = await import('react')
  return {
    Layer: (props: Record<string, unknown>) => {
      mapaMock.layers.set(String(props.id), props)
      return null
    },
    Marker: () => null,
    Source: (props: Record<string, unknown> & { children?: React.ReactNode }) => {
      mapaMock.sources.set(String(props.id), props)
      return <>{props.children}</>
    },
  }
})

import { RadarMeteo } from './radar-meteo'

interface ImagenCapturada {
  data: Uint8ClampedArray
  width: number
  height: number
}

const imagenes: ImagenCapturada[] = []

function crearContexto(): CanvasRenderingContext2D {
  const contexto = {
    filter: 'none',
    createImageData: (width: number, height: number) => ({
      data: new Uint8ClampedArray(width * height * 4),
      width,
      height,
    }),
    putImageData: (imageData: ImageData) => {
      imagenes.push({ data: imageData.data, width: imageData.width, height: imageData.height })
    },
    drawImage: () => undefined,
    clearRect: () => undefined,
  }
  return contexto as unknown as CanvasRenderingContext2D
}

function crearMapa() {
  const capas = new Set([
    'infra-departamentos-borde',
    'infra-departamentos-etiqueta',
    'radar-meteo-inverse-mask',
  ])
  return {
    getZoom: () => 8,
    getLayer: (id: string) => capas.has(id) ? { id } : undefined,
    getSource: () => undefined,
    triggerRepaint: () => undefined,
    on: (evento: string, listener: () => void) => {
      const listeners = mapaMock.listeners.get(evento) ?? new Set()
      listeners.add(listener)
      mapaMock.listeners.set(evento, listeners)
    },
    off: (evento: string, listener: () => void) => mapaMock.listeners.get(evento)?.delete(listener),
    trigger: (evento: string) => mapaMock.listeners.get(evento)?.forEach((listener) => listener()),
  }
}

function montarRadar() {
  const map = crearMapa()
  render(<RadarMeteo activo variable="lluvia" resumen={null} alertasResaltadas={[]} onVerAlertas={() => undefined} />)
  act(() => window.dispatchEvent(new CustomEvent('radar-meteo-map-ready', { detail: map })))
  return map
}

function datosRaster(): ImagenCapturada {
  const imagen = imagenes.at(-1)
  if (!imagen) throw new Error('No se capturó ImageData del raster')
  return imagen
}

describe('RadarMeteo — raster de lluvia con respuesta real reducida', () => {
  beforeEach(() => {
    mapaMock.sources.clear()
    mapaMock.layers.clear()
    mapaMock.listeners.clear()
    imagenes.length = 0
    vi.useFakeTimers({ toFake: ['Date'] })
    // Los tiempos del fixture no llevan zona y Date.parse los interpreta en la zona local de la prueba.
    vi.setSystemTime(new Date('2026-10-08T08:00:00.000Z'))
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', () => undefined)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ type: 'FeatureCollection', features: [] }),
    }))
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => crearContexto())
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,TEST')
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
    window.history.replaceState({}, '', '/')
  })

  it('dibuja la lluvia del cuarto paso y monta el source y layer raster', async () => {
    montarRadar()

    await waitFor(() => expect(mapaMock.sources.has('radar-meteo-image')).toBe(true))
    const source = mapaMock.sources.get('radar-meteo-image')
    expect(source?.url).toBe('data:image/png;base64,TEST')
    expect(mapaMock.layers.get('radar-meteo-raster')?.type).toBe('raster')
    expect(screen.getByLabelText('Cuadro del pronóstico')).toHaveValue('3')

    const imagen = datosRaster()
    const alfas = Array.from({ length: imagen.width * imagen.height }, (_, index) => imagen.data[index * 4 + 3])
    expect(alfas.some((alfa) => alfa > 0)).toBe(true)

    const valores = fixture.valores.precipitation?.[3]
    const indiceMaximo = valores?.findIndex((valor) => valor === Math.max(...(valores ?? []).filter((valor): valor is number => valor !== null))) ?? -1
    const celdaMaxima = fixture.grid?.celdas[indiceMaximo]
    expect(celdaMaxima).toBeDefined()
    const fila = celdaMaxima?.fila ?? 0
    const columna = celdaMaxima?.columna ?? 0
    const x = Math.round(columna / (fixture.grid!.columnas - 1) * (imagen.width - 1))
    const y = Math.round(fila / (fixture.grid!.filas - 1) * (imagen.height - 1))
    const pixel = (y * imagen.width + x) * 4
    const esperado = colorLluvia(53 / 3)
    expect(imagen.data[pixel + 3]).toBeGreaterThanOrEqual(190)
    expect(Math.abs(imagen.data[pixel] - esperado[0])).toBeLessThanOrEqual(15)
    expect(Math.abs(imagen.data[pixel + 1] - esperado[1])).toBeLessThanOrEqual(15)
    expect(Math.abs(imagen.data[pixel + 2] - esperado[2])).toBeLessThanOrEqual(15)
  })

  it('mantiene transparente el paso completamente seco', async () => {
    vi.setSystemTime(new Date('2026-10-06T05:00:00.000Z'))
    montarRadar()

    await waitFor(() => expect(mapaMock.sources.has('radar-meteo-image')).toBe(true))
    const imagen = datosRaster()
    for (let index = 3; index < imagen.data.length; index += 4) {
      expect(imagen.data[index]).toBe(0)
    }
  })

  it('publica puntos debug sólo para celdas con lluvia visible y sus valores coloreados', async () => {
    window.history.replaceState({}, '', '/?radarDebug=1')
    montarRadar()

    await waitFor(() => expect(mapaMock.sources.has('radar-meteo-debug-points')).toBe(true))
    const source = mapaMock.sources.get('radar-meteo-debug-points')
    const coleccion = source?.data as { features: Array<{ properties: { color?: unknown; value?: unknown } }> } | undefined
    const esperadas = (fixture.valores.precipitation?.[3] ?? []).filter((valor): valor is number =>
      valor !== null && valor / 3 >= 0.1 && colorLluvia(valor / 3)[3] > 0,
    )
    expect(coleccion?.features).toHaveLength(esperadas.length)
    expect(coleccion?.features.every((feature) =>
      typeof feature.properties.color === 'string'
      && /^rgba\(\d+, \d+, \d+, [\d.]+\)$/.test(feature.properties.color)
      && typeof feature.properties.value === 'number',
    )).toBe(true)
    expect(coleccion?.features.map((feature) => feature.properties.value)).toEqual(esperadas.map((valor) => valor / 3))
    expect(coleccion?.features.map((feature) => feature.properties.color)).toEqual(esperadas.map((valor) => rgbaComoCss(colorLluvia(valor / 3))))
  })
})
