// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCorridasRadarMeteo } from './use-corridas-radar-meteo'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('useCorridasRadarMeteo', () => {
  it('pide la lista de corridas y la expone en data', async () => {
    const respuesta = { corridas: [{ id: 'run-2', runAt: '2026-10-08T12:00:00.000Z', fetchedAt: '2026-10-08T12:05:00.000Z' }] }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(respuesta), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useCorridasRadarMeteo())

    await waitFor(() => expect(result.current.data).toEqual(respuesta))
    expect(fetchMock).toHaveBeenCalledWith('/api/infraestructura/radar-meteo/corridas', expect.objectContaining({ cache: 'no-store' }))
    expect(result.current.error).toBeNull()
  })

  it('no hace fetch cuando está inactivo', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useCorridasRadarMeteo({ activo: false }))

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.current).toEqual({ data: null, loading: false, error: null })
  })

  it('expone el error ante una respuesta no exitosa', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 500 })))

    const { result } = renderHook(() => useCorridasRadarMeteo())

    await waitFor(() => expect(result.current.error).toBe('No se pudieron cargar las corridas del radar.'))
    expect(result.current.data).toBeNull()
  })
})
