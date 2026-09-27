// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { useRiesgoSnapshot, type RespuestaRiesgoSnapshot } from './use-riesgo-snapshot'

function respuesta(snapshotId: string, factores: RespuestaRiesgoSnapshot['factores'] = []): RespuestaRiesgoSnapshot {
  return {
    snapshot: {
      id: snapshotId,
      runId: 'run-1',
      cueAnexo: '1801605-04',
      horizonteHoras: 24,
      evidenciaValida: true,
      scoreRiesgo: 0.8,
      nivelRiesgo: 'alto',
      scoreAmenaza: 0.7,
      scoreVulnerabilidad: 0.4,
      confianza: 'alta',
      exposicionMatricula: 120,
      exposicionSecciones: 6,
      calculadoEn: '2026-09-27T00:00:00Z',
      validoHasta: '2026-09-28T00:00:00Z',
    },
    factores,
  }
}

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response
}

let fetchMock: ReturnType<typeof vi.fn>
let calls: string[]

function Probe({ snapshotId }: { snapshotId: string | null }) {
  const { data, loading, error } = useRiesgoSnapshot(snapshotId)
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="error">{error ?? ''}</span>
      <span data-testid="factores">{data?.factores.length ?? ''}</span>
      <span data-testid="cue">{data?.snapshot.cueAnexo ?? ''}</span>
    </div>
  )
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

beforeEach(() => {
  calls = []
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('useRiesgoSnapshot', () => {
  it('con snapshotId=null no dispara ningún fetch', async () => {
    render(<Probe snapshotId={null} />)
    await flush()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('pide el detalle a la ruta correcta y expone los factores', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      calls.push(url)
      return jsonResponse(respuesta('snap-1', [
        {
          tipo: 'amenaza',
          fuente: 'ensemble ECMWF',
          variable: 'precipitacion_72h',
          valor: 45,
          unidad: 'mm',
          contribucion: 0.3,
          peso: 0.5,
          explicacion: 'Precipitación sobre P95',
          observadoEn: '2026-09-26T06:00:00Z',
        },
      ]))
    })

    const { rerender } = render(<Probe snapshotId="snap-1" />)
    await flush()

    expect(calls).toEqual(['/api/infraestructura/riesgo/snap-1'])
    expect(document.querySelector('[data-testid="factores"]')?.textContent).toBe('1')
    expect(document.querySelector('[data-testid="cue"]')?.textContent).toBe('1801605-04')
    expect(document.querySelector('[data-testid="loading"]')?.textContent).toBe('false')

    rerender(<Probe snapshotId="snap-1" />)
  })

  it('escapa el snapshotId en la URL', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      calls.push(url)
      return jsonResponse(respuesta('snap con espacio'))
    })

    render(<Probe snapshotId="snap con espacio" />)
    await flush()

    expect(calls).toEqual(['/api/infraestructura/riesgo/snap%20con%20espacio'])
  })

  it('si la respuesta no es ok, expone un error y ningún dato', async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ error: 'no encontrado' }, false, 404))

    render(<Probe snapshotId="snap-inexistente" />)
    await flush()

    expect(document.querySelector('[data-testid="error"]')?.textContent).toBe(
      'No se pudo cargar el detalle del riesgo.',
    )
    expect(document.querySelector('[data-testid="factores"]')?.textContent).toBe('')
  })

  it('al cambiar de snapshotId vuelve a pedir y descarta el resultado anterior', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      calls.push(url)
      const id = url.split('/').pop() as string
      return jsonResponse(respuesta(id))
    })

    const { rerender } = render(<Probe snapshotId="snap-a" />)
    await flush()
    expect(document.querySelector('[data-testid="cue"]')?.textContent).toBe('1801605-04')

    rerender(<Probe snapshotId="snap-b" />)
    await flush()

    expect(calls).toEqual([
      '/api/infraestructura/riesgo/snap-a',
      '/api/infraestructura/riesgo/snap-b',
    ])
  })

  it('al deseleccionar (snapshotId=null) el consumidor deja de ver el snapshot anterior', async () => {
    fetchMock.mockImplementation(async () => jsonResponse(respuesta('snap-a')))

    const { rerender } = render(<Probe snapshotId="snap-a" />)
    await flush()
    expect(document.querySelector('[data-testid="factores"]')?.textContent).toBe('0')

    rerender(<Probe snapshotId={null} />)
    await flush()

    expect(document.querySelector('[data-testid="factores"]')?.textContent).toBe('')
    expect(document.querySelector('[data-testid="loading"]')?.textContent).toBe('false')
    expect(document.querySelector('[data-testid="error"]')?.textContent).toBe('')
  })
})
