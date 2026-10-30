// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { DatasetV29 } from '@/lib/reorganizacion/tipos'
import {
  MENSAJE_ERROR_DATOS,
  MENSAJE_SIN_PERMISO,
  URL_DATOS_REORGANIZACION,
  reiniciarCacheDatosReorganizacion,
  useDatasetReorganizacion,
} from './use-dataset-reorganizacion'

const DATASET = { version: 'V29', corte: '2026-09-01', escuelas: [] } as unknown as DatasetV29

function respuesta(status: number, cuerpo?: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => cuerpo,
  }
}

const fetchMock = vi.fn()

beforeEach(() => {
  reiniciarCacheDatosReorganizacion()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('useDatasetReorganizacion', () => {
  it('pasa de cargando a listo con el dataset del servidor', async () => {
    fetchMock.mockResolvedValue(respuesta(200, DATASET))

    const { result } = renderHook(() => useDatasetReorganizacion())
    expect(result.current.estado).toBe('cargando')

    await waitFor(() => expect(result.current.estado).toBe('listo'))
    expect(result.current.dataset).toEqual(DATASET)
    expect(fetchMock).toHaveBeenCalledWith(URL_DATOS_REORGANIZACION, expect.objectContaining({ cache: 'no-store' }))
  })

  it.each([401, 403])('responde sin_permiso con HTTP %i', async (status) => {
    fetchMock.mockResolvedValue(respuesta(status, { error: 'x' }))

    const { result } = renderHook(() => useDatasetReorganizacion())

    await waitFor(() => expect(result.current.estado).toBe('sin_permiso'))
    expect(result.current.mensaje).toBe(MENSAJE_SIN_PERMISO)
    expect(result.current.dataset).toBeUndefined()
  })

  it('no cachea un 401 y vuelve a pedir los datos al montar de nuevo', async () => {
    fetchMock.mockResolvedValueOnce(respuesta(401)).mockResolvedValueOnce(respuesta(200, DATASET))

    const primero = renderHook(() => useDatasetReorganizacion())
    await waitFor(() => expect(primero.result.current.estado).toBe('sin_permiso'))
    primero.unmount()

    const segundo = renderHook(() => useDatasetReorganizacion())
    await waitFor(() => expect(segundo.result.current.estado).toBe('listo'))
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('informa error con HTTP 500 y reintenta al llamar reintentar', async () => {
    fetchMock.mockResolvedValueOnce(respuesta(500)).mockResolvedValueOnce(respuesta(200, DATASET))

    const { result } = renderHook(() => useDatasetReorganizacion())
    await waitFor(() => expect(result.current.estado).toBe('error'))
    expect(result.current.mensaje).toBe(MENSAJE_ERROR_DATOS)

    act(() => result.current.reintentar())
    expect(result.current.estado).toBe('cargando')

    await waitFor(() => expect(result.current.estado).toBe('listo'))
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('no vuelve a pedir los datos al re-renderizar', async () => {
    fetchMock.mockResolvedValue(respuesta(200, DATASET))

    const { result, rerender } = renderHook(() => useDatasetReorganizacion())
    await waitFor(() => expect(result.current.estado).toBe('listo'))

    rerender()
    rerender()

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reutiliza la caché de módulo en montajes posteriores', async () => {
    fetchMock.mockResolvedValue(respuesta(200, DATASET))

    const primero = renderHook(() => useDatasetReorganizacion())
    await waitFor(() => expect(primero.result.current.estado).toBe('listo'))
    primero.unmount()

    const segundo = renderHook(() => useDatasetReorganizacion())
    expect(segundo.result.current.estado).toBe('listo')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('aborta la descarga en vuelo al desmontar y no informa error', async () => {
    fetchMock.mockImplementation(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new DOMException('abortado', 'AbortError')))
        }),
    )

    const { result, unmount } = renderHook(() => useDatasetReorganizacion())
    const signal: AbortSignal = fetchMock.mock.calls[0][1].signal
    unmount()

    expect(signal.aborted).toBe(true)
    expect(result.current.estado).toBe('cargando')
  })
})
