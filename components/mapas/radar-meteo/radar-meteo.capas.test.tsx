// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, waitFor } from '@testing-library/react'

const mapaMock = vi.hoisted(() => ({
  capas: new Set<string>(),
  orden: [] as string[],
  listeners: new Map<string, Set<() => void>>(),
}))

vi.mock('@/lib/infraestructura/radar-meteo/use-radar-meteo', () => ({
  useRadarMeteo: () => ({ data: null, loading: false, error: null }),
}))

vi.mock('react-map-gl/maplibre', async () => {
  const React = await import('react')
  return {
    Layer: (props: { id: string; beforeId?: string }) => {
      React.useLayoutEffect(() => {
        if (props.beforeId && !mapaMock.capas.has(props.beforeId)) {
          throw new Error(`Cannot add layer "${props.id}" before non-existing layer "${props.beforeId}".`)
        }
        mapaMock.capas.add(props.id)
        const posicion = props.beforeId ? mapaMock.orden.indexOf(props.beforeId) : -1
        mapaMock.orden.splice(posicion >= 0 ? posicion : mapaMock.orden.length, 0, props.id)
        return () => {
          mapaMock.capas.delete(props.id)
          mapaMock.orden = mapaMock.orden.filter((id) => id !== props.id)
        }
      }, [props.id, props.beforeId])
      return null
    },
    Marker: () => null,
    Source: (props: { children?: React.ReactNode }) => <>{props.children}</>,
  }
})

import { RadarMeteo } from './radar-meteo'

function crearMapa() {
  return {
    getZoom: () => 8,
    getLayer: (id: string) => mapaMock.capas.has(id) ? { id } : undefined,
    on: (evento: string, listener: () => void) => {
      const listeners = mapaMock.listeners.get(evento) ?? new Set()
      listeners.add(listener)
      mapaMock.listeners.set(evento, listeners)
    },
    off: (evento: string, listener: () => void) => mapaMock.listeners.get(evento)?.delete(listener),
    trigger: (evento: string) => mapaMock.listeners.get(evento)?.forEach((listener) => listener()),
  }
}

function avisarMapa(map: ReturnType<typeof crearMapa>) {
  window.dispatchEvent(new CustomEvent('radar-meteo-map-ready', { detail: map }))
}

describe('RadarMeteo — montaje de capas con capas base', () => {
  beforeEach(() => {
    mapaMock.capas.clear()
    mapaMock.orden.length = 0
    mapaMock.listeners.clear()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({
        type: 'FeatureCollection',
        features: [-2, 2].map((offset) => ({
          type: 'Feature',
          properties: {},
          geometry: { type: 'Polygon', coordinates: [[[offset, -1], [offset + 1, -1], [offset + 1, 1], [offset, 1], [offset, -1]]] },
        })),
      }),
    }))
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('espera a que existan las capas base y coloca la máscara antes del borde', async () => {
    const map = crearMapa()
    render(<RadarMeteo activo variable="lluvia" />)
    act(() => avisarMapa(map))

    expect(mapaMock.capas.has('radar-meteo-inverse-mask')).toBe(false)

    mapaMock.capas.add('infra-departamentos-borde')
    mapaMock.capas.add('infra-departamentos-etiqueta')
    mapaMock.orden.push('infra-departamentos-borde', 'infra-departamentos-etiqueta')
    act(() => map.trigger('styledata'))

    await waitFor(() => expect(mapaMock.capas.has('radar-meteo-inverse-mask')).toBe(true))
    expect(mapaMock.capas.has('infra-departamentos-borde')).toBe(true)
    expect(mapaMock.orden.indexOf('radar-meteo-inverse-mask')).toBeLessThan(mapaMock.orden.indexOf('infra-departamentos-borde'))
  })

  it('monta la máscara sin excepción cuando las capas base ya están presentes', async () => {
    const map = crearMapa()
    mapaMock.capas.add('infra-departamentos-borde')
    mapaMock.capas.add('infra-departamentos-etiqueta')
    mapaMock.orden.push('infra-departamentos-borde', 'infra-departamentos-etiqueta')

    render(<RadarMeteo activo variable="lluvia" />)
    act(() => avisarMapa(map))

    await waitFor(() => expect(mapaMock.capas.has('radar-meteo-inverse-mask')).toBe(true))
    expect(mapaMock.orden.indexOf('radar-meteo-inverse-mask')).toBeLessThan(mapaMock.orden.indexOf('infra-departamentos-borde'))
  })
})
