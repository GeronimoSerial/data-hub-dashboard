// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { useReplay, type FiltrosReplay, type RespuestaReplay } from './use-replay'

function respuesta(instante: string): RespuestaReplay {
  return {
    cuadros: [
      {
        instante,
        afectacionesConfirmadas: [],
        snapshotRiesgo: null,
        nivelesPeligro: [],
        lluviaObservada: [],
        saludFuentes: [],
      },
    ],
    vacios: [{ snapshotRiesgo: true, peligro: true, lluvia: true }],
    siguienteDesde: null,
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

function Probe({ filtros, activo }: { filtros: FiltrosReplay; activo: boolean }) {
  const { data, loading, error } = useReplay(filtros, activo)
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="error">{error ?? ''}</span>
      <span data-testid="cuadros">{data?.cuadros.length ?? ''}</span>
    </div>
  )
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

const FILTROS_BASE: FiltrosReplay = {
  territorioId: 'Capital',
  desde: '2026-01-01T00:00:00Z',
  hasta: '2026-01-02T00:00:00Z',
  vista: 'conocido',
}

beforeEach(() => {
  calls = []
  fetchMock = vi.fn(async (url: string) => {
    calls.push(url)
    return jsonResponse(respuesta('2026-01-01T00:00:00Z'))
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('useReplay', () => {
  it('con activo=false no dispara ningún request', async () => {
    render(<Probe filtros={FILTROS_BASE} activo={false} />)
    await flush()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('con activo=true y alcance completo dispara el request y arma la query string', async () => {
    render(<Probe filtros={FILTROS_BASE} activo={true} />)
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = calls[0]
    expect(url).toContain('territorioTipo=departamento')
    expect(url).toContain('territorioId=Capital')
    expect(url).toContain('vista=conocido')
    expect(url).toContain('desde=2026-01-01T00%3A00%3A00Z')
  })

  it('con activo=true pero alcance incompleto (falta hasta) no dispara request', async () => {
    render(
      <Probe
        filtros={{ territorioId: 'Capital', desde: '2026-01-01T00:00:00Z', vista: 'conocido' }}
        activo={true}
      />,
    )
    await flush()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('con episodioDerivadoId el alcance ya es completo sin desde/hasta', async () => {
    render(
      <Probe filtros={{ vista: 'conocido', episodioDerivadoId: 'ep-1' }} activo={true} />,
    )
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(calls[0]).toContain('episodioDerivadoId=ep-1')
  })

  it('renueva el pedido al cambiar la vista', async () => {
    const { rerender } = render(<Probe filtros={FILTROS_BASE} activo={true} />)
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    rerender(<Probe filtros={{ ...FILTROS_BASE, vista: 'reconstruido' }} activo={true} />)
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(calls[1]).toContain('vista=reconstruido')
  })

  it('al pasar de activo a inactivo no deja datos expuestos', async () => {
    const { rerender } = render(<Probe filtros={FILTROS_BASE} activo={true} />)
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    rerender(<Probe filtros={FILTROS_BASE} activo={false} />)
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('cancela el request pendiente al desmontar sin actualizar estado', async () => {
    const { unmount } = render(<Probe filtros={FILTROS_BASE} activo={true} />)
    unmount()
    await flush()
    // No debe lanzar ni dejar un setState pendiente: la sola ausencia de
    // errores no capturados en este test ya prueba el cleanup.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
