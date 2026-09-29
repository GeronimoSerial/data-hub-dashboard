// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { __limpiarCacheExposicionRuta, useExposicionRuta } from './use-exposicion-ruta'
import type { ExposicionRutaRespuesta } from './exposicion-ruta'
import { jsonResponse } from './test-utils/http'

function exposicion(cueAnexo: string): ExposicionRutaRespuesta {
  return { cueAnexo, disponible: true, estado: 'sin_profundidad', versionJob: '1', resumen: { celdasTotal: 2, celdasConDato: 2, celdasConProfundidad: 0, profundidadMaxM: null, cobertura: 1 }, celdasAfectadas: [], resolucionArcsec: 30, periodoRetornoAnios: 100, escenario: 'historico', fuente: 'WRI Aqueduct v2 vía OS-Climate physrisk', licencia: 'Apache-2.0', fechaCorrida: '2026-06-01', aviso: 'Indicador histórico' }
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
  __limpiarCacheExposicionRuta()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('useExposicionRuta', () => {
  it('no hace fetch cuando cueAnexo es null', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useExposicionRuta(null, true))
    await flush()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.current.loading).toBe(false)
    expect(result.current.data).toBeNull()
  })

  it('no hace fetch cuando está deshabilitado', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    renderHook(() => useExposicionRuta('CUE-A', false))
    await flush()

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('hace fetch una sola vez y reutiliza el cache al reseleccionar', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      jsonResponse(exposicion(url.includes('CUE-A') ? 'CUE-A' : 'CUE-B')),
    )
    vi.stubGlobal('fetch', fetchMock)

    const { result, rerender } = renderHook(
      ({ cue }: { cue: string | null }) => useExposicionRuta(cue, true),
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
      return Promise.resolve(jsonResponse(exposicion('CUE-A')))
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result, rerender } = renderHook(
      ({ cue }: { cue: string | null }) => useExposicionRuta(cue, true),
      { initialProps: { cue: 'CUE-A' } },
    )
    await flush()
    expect(result.current.data?.cueAnexo).toBe('CUE-A')

    rerender({ cue: 'CUE-B' })
    await flush()
    expect(result.current.loading).toBe(true)
    expect(result.current.data).toBeNull()
  })

  it('aborta el fetch anterior y usa la ruta de exposición al cambiar de cue', () => {
    const fetchMock = vi.fn(
      (_url: string, _init?: RequestInit) => new Promise<Response>(() => {}),
    )
    vi.stubGlobal('fetch', fetchMock)

    const { rerender } = renderHook(
      ({ cue }: { cue: string }) => useExposicionRuta(cue, true),
      { initialProps: { cue: 'CUE-A' } },
    )
    const signal = fetchMock.mock.calls[0]?.[1]?.signal

    rerender({ cue: 'CUE-B' })

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/api/mapas/infraestructura/accesos/CUE-A/exposicion-inundacion',
    )
    expect(signal?.aborted).toBe(true)
  })

  it('expone el mensaje de error ante una respuesta HTTP no exitosa', async () => {
    const fetchMock = vi.fn(
      async () => ({ ok: false, status: 500, json: async () => ({}) }) as Response,
    )
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useExposicionRuta('CUE-A', true))
    await flush()

    expect(result.current.error).toBe('No se pudo cargar la exposición histórica de la ruta.')
    expect(result.current.data).toBeNull()
  })
})
