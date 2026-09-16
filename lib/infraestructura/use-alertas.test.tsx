// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { useAlertas } from './use-alertas'
import type { ConsultaAlertasResultado, FiltrosAlertas } from './consulta'

function resultado(n: number): ConsultaAlertasResultado {
  return {
    alertas: [],
    indicadores: {
      escuelas: n,
      localizaciones: n,
      inmuebles: null,
      inmueblesDisponible: false,
      alumnos: n,
      universoEducativo: n,
    },
  }
}

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response
}

let calls: string[]
let fetchMock: ReturnType<typeof vi.fn>

function Probe({ filtros }: { filtros: FiltrosAlertas }) {
  const { data, loading, error } = useAlertas(filtros)
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="error">{error ?? ''}</span>
      <span data-testid="escuelas">{data?.indicadores.escuelas ?? ''}</span>
    </div>
  )
}

// Deja correr las promesas pendientes (el fetch mockeado y sus .then) sin
// avanzar el reloj, para que React procese el estado que resulta de ellas.
async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  calls = []
  let n = 0
  fetchMock = vi.fn(async (url: string) => {
    calls.push(url)
    n += 1
    return jsonResponse(resultado(n))
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('useAlertas', () => {
  it('hace la carga inicial y luego un polling cada 15s', async () => {
    render(<Probe filtros={{}} />)
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000)
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000)
    })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('pausa el polling con la pestaña oculta y refresca al recuperar visibilidad', async () => {
    render(<Probe filtros={{}} />)
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => true,
    })
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000)
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => false,
    })
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await Promise.resolve()
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('refresca al recuperar el foco de la ventana', async () => {
    render(<Probe filtros={{}} />)
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      window.dispatchEvent(new Event('focus'))
      await Promise.resolve()
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('cancela el polling y no actualiza estado tras desmontar', async () => {
    const { unmount } = render(<Probe filtros={{}} />)
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    unmount()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000)
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('renueva el pedido con nuevos filtros y arma la query string con "establecimiento"', async () => {
    const { rerender } = render(<Probe filtros={{}} />)
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    rerender(<Probe filtros={{ cueAnexo: '1801605-04', severidad: 'Alta' }} />)
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(2)

    const url = calls[calls.length - 1]
    expect(url).toContain('establecimiento=1801605-04')
    expect(url).toContain('severidad=Alta')
    expect(url).not.toContain('cueAnexo')
  })
})
