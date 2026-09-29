// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { __limpiarCacheGeometria, useGeometriaAcceso } from './use-geometria-acceso'
import type { GeometriaAccesoRespuesta } from './territorio-mapa'

function geometria(cueAnexo: string): GeometriaAccesoRespuesta {
  return {
    cueAnexo,
    disponible: true,
    ruta: {
      type: 'LineString',
      coordinates: [
        [-64.2, -31.4],
        [-64.1, -31.3],
      ],
    },
    cruces: [],
  }
}

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response
}

// Deja correr las promesas pendientes (fetch mockeado y sus .then) sin avanzar
// el reloj, para que React procese el estado resultante.
async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

beforeEach(() => {
  __limpiarCacheGeometria()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('useGeometriaAcceso', () => {
  it('no hace fetch cuando cueAnexo es null', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useGeometriaAcceso(null, true))
    await flush()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.current.loading).toBe(false)
    expect(result.current.data).toBeNull()
  })

  it('no hace fetch cuando está deshabilitado', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    renderHook(() => useGeometriaAcceso('CUE-A', false))
    await flush()

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('hace fetch una sola vez y reutiliza el cache al reseleccionar', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      jsonResponse(geometria(url.includes('CUE-A') ? 'CUE-A' : 'CUE-B')),
    )
    vi.stubGlobal('fetch', fetchMock)

    const { result, rerender } = renderHook(
      ({ cue }: { cue: string | null }) => useGeometriaAcceso(cue, true),
      { initialProps: { cue: 'CUE-A' } },
    )
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.current.data?.cueAnexo).toBe('CUE-A')

    rerender({ cue: 'CUE-B' })
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.current.data?.cueAnexo).toBe('CUE-B')

    rerender({ cue: 'CUE-A' })
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.current.data?.cueAnexo).toBe('CUE-A')
  })

  it('resetea data a null al cambiar de cue mientras carga', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('CUE-B')) return new Promise<Response>(() => {})
      return Promise.resolve(jsonResponse(geometria('CUE-A')))
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result, rerender } = renderHook(
      ({ cue }: { cue: string | null }) => useGeometriaAcceso(cue, true),
      { initialProps: { cue: 'CUE-A' } },
    )
    await flush()
    expect(result.current.data?.cueAnexo).toBe('CUE-A')

    rerender({ cue: 'CUE-B' })
    await flush()
    expect(result.current.loading).toBe(true)
    expect(result.current.data).toBeNull()
  })

  it('aborta el fetch anterior y usa la ruta de geometría al cambiar de cue', () => {
    const fetchMock = vi.fn(
      (_url: string, _init?: RequestInit) => new Promise<Response>(() => {}),
    )
    vi.stubGlobal('fetch', fetchMock)

    const { rerender } = renderHook(
      ({ cue }: { cue: string }) => useGeometriaAcceso(cue, true),
      { initialProps: { cue: 'CUE-A' } },
    )
    const signal = fetchMock.mock.calls[0]?.[1]?.signal

    rerender({ cue: 'CUE-B' })

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/api/mapas/infraestructura/accesos/CUE-A/geometria',
    )
    expect(signal?.aborted).toBe(true)
  })

  it('expone el mensaje de error ante una respuesta HTTP no exitosa', async () => {
    const fetchMock = vi.fn(
      async () => ({ ok: false, status: 500, json: async () => ({}) }) as Response,
    )
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useGeometriaAcceso('CUE-A', true))
    await flush()

    expect(result.current.error).toBe('No se pudo cargar el camino de esta escuela. Probá de nuevo en unos minutos.')
    expect(result.current.data).toBeNull()
  })
})
