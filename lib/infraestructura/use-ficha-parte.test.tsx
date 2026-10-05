// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { useFichaParte } from './use-ficha-parte'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function respuesta(cuerpo: unknown): Response {
  return new Response(JSON.stringify(cuerpo), { status: 200 })
}

describe('useFichaParte', () => {
  it('carga la parte y el historial para el CUE', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      return url.includes('/historial?')
        ? respuesta({ ok: true, movimientos: [{ id: 'mov-1' }] })
        : respuesta({ ok: true, parte: { cueAnexo: '1801605-04' } })
    }))

    const { result } = renderHook(() => useFichaParte('1801605-04'))

    await waitFor(() => {
      expect(result.current.estado.fase).toBe('listo')
      expect(result.current.historial.fase).toBe('listo')
    })
    expect(result.current.estado).toMatchObject({ fase: 'listo', datos: { parte: { cueAnexo: '1801605-04' } } })
    expect(result.current.historial).toMatchObject({ fase: 'listo', movimientos: [{ id: 'mov-1' }] })
  })

  it('mantiene independiente el error del fetch de parte', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes('/historial?')
        ? respuesta({ ok: true, movimientos: [] })
        : Promise.reject(new Error('sin red')),
    ))

    const { result } = renderHook(() => useFichaParte('1801605-04'))

    await waitFor(() => {
      expect(result.current.estado.fase).toBe('error')
      expect(result.current.historial.fase).toBe('listo')
    })
  })

  it('mantiene independiente el error del fetch de historial', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes('/historial?')
        ? Promise.reject(new Error('sin red'))
        : respuesta({ ok: true, parte: { cueAnexo: '1801605-04' } }),
    ))

    const { result } = renderHook(() => useFichaParte('1801605-04'))

    await waitFor(() => {
      expect(result.current.estado.fase).toBe('listo')
      expect(result.current.historial.fase).toBe('error')
    })
  })

  it('descarta resultados tardíos del CUE anterior', async () => {
    let resolverParteAnterior: ((response: Response) => void) | undefined
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/parte?') && url.includes('cue=anterior')) {
        return new Promise<Response>((resolve) => { resolverParteAnterior = resolve })
      }
      const cue = url.includes('cue=vigente') ? 'vigente' : 'anterior'
      return Promise.resolve(respuesta(
        url.includes('/historial?')
          ? { ok: true, movimientos: [] }
          : { ok: true, parte: { cueAnexo: cue } },
      ))
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result, rerender } = renderHook(
      ({ cue }) => useFichaParte(cue),
      { initialProps: { cue: 'anterior' } },
    )
    rerender({ cue: 'vigente' })

    await waitFor(() => {
      expect(result.current.estado).toMatchObject({ fase: 'listo', datos: { parte: { cueAnexo: 'vigente' } } })
    })
    resolverParteAnterior?.(respuesta({ ok: true, parte: { cueAnexo: 'anterior' } }))

    await waitFor(() => expect(result.current.estado).toMatchObject({
      fase: 'listo', datos: { parte: { cueAnexo: 'vigente' } },
    }))
  })
})
