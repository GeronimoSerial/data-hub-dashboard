// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useRadarMeteo } from './use-radar-meteo'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function respuestaVacia() {
  return new Response(JSON.stringify({ runId: null, sinDatos: true }), { status: 200 })
}

function urlPedida(fetchMock: ReturnType<typeof vi.fn>): URL {
  const [url] = fetchMock.mock.calls[0] as [string]
  return new URL(url, 'http://localhost')
}

describe('useRadarMeteo', () => {
  it('envía asOf como query param cuando se indica', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respuestaVacia())
    vi.stubGlobal('fetch', fetchMock)

    const asOf = '2026-10-07T18:00:00-03:00'
    renderHook(() => useRadarMeteo({ asOf }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(urlPedida(fetchMock).pathname).toBe('/api/infraestructura/radar-meteo')
    expect(urlPedida(fetchMock).searchParams.get('asOf')).toBe(asOf)
  })

  it('no envía asOf cuando no se indica', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respuestaVacia())
    vi.stubGlobal('fetch', fetchMock)

    renderHook(() => useRadarMeteo())

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(urlPedida(fetchMock).searchParams.has('asOf')).toBe(false)
  })
})
