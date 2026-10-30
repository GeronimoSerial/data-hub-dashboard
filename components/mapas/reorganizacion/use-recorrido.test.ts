// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { URL_RUTA_RECORRIDO, useRecorrido, type PuntoRecorrido } from './use-recorrido'

const ESCUELA_A: PuntoRecorrido = { cue: '1800001', nombre: 'Escuela A', lat: -27.47, lon: -58.83 }
const ESCUELA_B: PuntoRecorrido = { cue: '1800002', nombre: 'Escuela B', lat: -27.5, lon: -58.8 }

const RUTA = {
  distanciaKm: 12.3,
  duracionMin: 95,
  geometria: { type: 'LineString', coordinates: [[-58.83, -27.47], [-58.8, -27.5]] },
}

const MENSAJE_SIN_RUTA = 'No hay un camino vial conectado entre ambos puntos.'

function respuesta(status: number, cuerpo?: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => cuerpo,
  }
}

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

// Medición completa: origen y destino elegidos, respuesta del proxy resuelta.
async function medir(result: { current: ReturnType<typeof useRecorrido> }) {
  act(() => result.current.activar())
  act(() => result.current.elegirPunto(ESCUELA_A))
  act(() => result.current.elegirPunto(ESCUELA_B))
}

describe('useRecorrido', () => {
  it('mide un recorrido entre dos puntos y guarda distancia y tiempo', async () => {
    fetchMock.mockResolvedValue(respuesta(200, RUTA))
    const { result } = renderHook(() => useRecorrido())

    act(() => result.current.activar())
    expect(result.current.estado).toBe('eligiendo_origen')

    act(() => result.current.elegirPunto(ESCUELA_A))
    expect(result.current.estado).toBe('eligiendo_destino')
    expect(result.current.origen).toEqual(ESCUELA_A)
    expect(fetchMock).not.toHaveBeenCalled()

    act(() => result.current.elegirPunto(ESCUELA_B))
    await waitFor(() => expect(result.current.estado).toBe('listo'))

    expect(result.current.destino).toEqual(ESCUELA_B)
    expect(result.current.resultado).toEqual(RUTA)
    expect(result.current.error).toBeNull()
    const url = new URL(fetchMock.mock.calls[0][0] as string, 'http://localhost')
    expect(url.pathname).toBe(URL_RUTA_RECORRIDO)
    expect(url.searchParams.get('origen')).toBe('-27.47,-58.83')
    expect(url.searchParams.get('destino')).toBe('-27.5,-58.8')
  })

  it('ignora selecciones mientras la medición está inactiva', () => {
    const { result } = renderHook(() => useRecorrido())

    act(() => result.current.elegirPunto(ESCUELA_A))

    expect(result.current.estado).toBe('inactivo')
    expect(result.current.origen).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sin_ruta_vial muestra el mensaje y no deja distancia', async () => {
    fetchMock.mockResolvedValue(respuesta(404, { error: 'sin_ruta_vial' }))
    const { result } = renderHook(() => useRecorrido())
    await medir(result)

    await waitFor(() => expect(result.current.estado).toBe('error'))
    expect(result.current.error).toEqual({ codigo: 'sin_ruta_vial', mensaje: MENSAJE_SIN_RUTA })
    expect(result.current.resultado).toBeNull()
  })

  it('504 informa el tiempo agotado', async () => {
    fetchMock.mockResolvedValue(respuesta(504, { error: 'tiempo_agotado' }))
    const { result } = renderHook(() => useRecorrido())
    await medir(result)

    await waitFor(() => expect(result.current.estado).toBe('error'))
    expect(result.current.error?.codigo).toBe('tiempo_agotado')
    expect(result.current.error?.mensaje).toBe('El servicio de recorridos tardó demasiado en responder.')
    expect(result.current.resultado).toBeNull()
  })

  it('una falla de red informa el error sin distancia', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const { result } = renderHook(() => useRecorrido())
    await medir(result)

    await waitFor(() => expect(result.current.estado).toBe('error'))
    expect(result.current.error?.codigo).toBe('red')
    expect(result.current.resultado).toBeNull()
  })

  it('una segunda medición cancela la consulta anterior y descarta su respuesta', async () => {
    let resolverPrimera: (valor: unknown) => void = () => undefined
    const primera = new Promise((resolver) => {
      resolverPrimera = resolver
    })
    fetchMock.mockReturnValueOnce(primera).mockResolvedValueOnce(respuesta(200, { ...RUTA, distanciaKm: 5 }))
    const { result } = renderHook(() => useRecorrido())
    await medir(result)
    const senalPrimera = fetchMock.mock.calls[0][1].signal as AbortSignal
    expect(senalPrimera.aborted).toBe(false)

    act(() => result.current.elegirPunto(ESCUELA_A))
    act(() => result.current.elegirPunto(ESCUELA_B))
    await waitFor(() => expect(result.current.estado).toBe('listo'))
    expect(senalPrimera.aborted).toBe(true)

    // La respuesta tardía de la primera medición no debe pisar la vigente.
    await act(async () => {
      resolverPrimera(respuesta(404, { error: 'sin_ruta_vial' }))
      await primera
    })
    expect(result.current.estado).toBe('listo')
    expect(result.current.error).toBeNull()
    expect(result.current.resultado?.distanciaKm).toBe(5)
  })

  it('al desmontar aborta la consulta en curso sin cambiar estado', async () => {
    fetchMock.mockReturnValue(new Promise(() => undefined))
    const { result, unmount } = renderHook(() => useRecorrido())
    await medir(result)
    const senal = fetchMock.mock.calls[0][1].signal as AbortSignal

    unmount()

    expect(senal.aborted).toBe(true)
  })

  it('desactivar cancela la consulta y vuelve a inactivo', async () => {
    fetchMock.mockReturnValue(new Promise(() => undefined))
    const { result } = renderHook(() => useRecorrido())
    await medir(result)
    const senal = fetchMock.mock.calls[0][1].signal as AbortSignal

    act(() => result.current.desactivar())

    expect(senal.aborted).toBe(true)
    expect(result.current.estado).toBe('inactivo')
    expect(result.current.origen).toBeNull()
    expect(result.current.destino).toBeNull()
  })

  it('limpiar borra la ruta y mantiene la medición activa', async () => {
    fetchMock.mockResolvedValue(respuesta(200, RUTA))
    const { result } = renderHook(() => useRecorrido())
    await medir(result)
    await waitFor(() => expect(result.current.estado).toBe('listo'))

    act(() => result.current.limpiar())

    expect(result.current.estado).toBe('eligiendo_origen')
    expect(result.current.origen).toBeNull()
    expect(result.current.destino).toBeNull()
    expect(result.current.resultado).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('fijarDestino y fijarOrigen re-miden cuando ya hay el otro extremo', async () => {
    fetchMock.mockResolvedValue(respuesta(200, RUTA))
    const { result } = renderHook(() => useRecorrido())
    act(() => result.current.activar())

    act(() => result.current.fijarDestino(ESCUELA_B))
    expect(result.current.estado).toBe('eligiendo_origen')
    expect(result.current.destino).toEqual(ESCUELA_B)

    act(() => result.current.fijarOrigen(ESCUELA_A))
    await waitFor(() => expect(result.current.estado).toBe('listo'))
    expect(result.current.origen).toEqual(ESCUELA_A)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('elegir un punto desde un resultado inicia otra medición', async () => {
    fetchMock.mockResolvedValue(respuesta(200, RUTA))
    const { result } = renderHook(() => useRecorrido())
    await medir(result)
    await waitFor(() => expect(result.current.estado).toBe('listo'))

    act(() => result.current.elegirPunto(ESCUELA_B))

    expect(result.current.estado).toBe('eligiendo_destino')
    expect(result.current.origen).toEqual(ESCUELA_B)
    expect(result.current.resultado).toBeNull()
  })
})
