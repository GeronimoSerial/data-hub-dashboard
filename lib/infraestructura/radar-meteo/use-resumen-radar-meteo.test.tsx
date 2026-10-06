// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useResumenRadarMeteo } from './use-resumen-radar-meteo'

afterEach(() => {
  cleanup()
  sessionStorage.clear()
  vi.unstubAllGlobals()
})

describe('useResumenRadarMeteo', () => {
  it('guarda y devuelve el resumen y su ETag al recibir 200', async () => {
    const resumen = { runId: 'run-1', alertasSmn: [] }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(resumen), { status: 200, headers: { ETag: '"v1"' } }))
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useResumenRadarMeteo(true))

    await waitFor(() => expect(result.current.resumen).toEqual(resumen))
    expect(sessionStorage.getItem('radar-meteo-resumen-v1-etag')).toBe('"v1"')
    expect(sessionStorage.getItem('radar-meteo-resumen-v1-data')).toBe(JSON.stringify(resumen))
    expect(result.current.error).toBe(false)
  })

  it('usa el resumen guardado al recibir 304', async () => {
    const resumen = { runId: 'guardado', alertasSmn: [] }
    sessionStorage.setItem('radar-meteo-resumen-v1-etag', '"v1"')
    sessionStorage.setItem('radar-meteo-resumen-v1-data', JSON.stringify(resumen))
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 304 }))
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useResumenRadarMeteo(true))

    await waitFor(() => expect(result.current.resumen).toEqual(resumen))
    expect(fetchMock).toHaveBeenCalledWith('/api/infraestructura/radar-meteo/resumen', { headers: { 'If-None-Match': '"v1"' } })
    expect(result.current.error).toBe(false)
  })

  it('informa error ante una respuesta no exitosa', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 500 })))

    const { result } = renderHook(() => useResumenRadarMeteo(true))

    await waitFor(() => expect(result.current.error).toBe(true))
  })

  it('informa error ante 304 si no hay resumen guardado', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 304 })))

    const { result } = renderHook(() => useResumenRadarMeteo(true))

    await waitFor(() => expect(result.current.error).toBe(true))
    expect(result.current.resumen).toBeNull()
  })

  it('no hace fetch cuando está inactivo', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    renderHook(() => useResumenRadarMeteo(false))

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
