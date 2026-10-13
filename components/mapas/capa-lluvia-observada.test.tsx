// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { CapaLluviaObservada, CLASES_LLUVIA } from './capa-lluvia-observada'

vi.mock('react-map-gl/maplibre', () => ({
  Source: ({ id, children }: { id: string; children: React.ReactNode }) => <div data-testid="source" data-id={id}>{children}</div>,
  Layer: (props: Record<string, unknown>) => <div data-testid="layer" data-props={JSON.stringify(props)} />,
}))

const RESPUESTA = {
  horas: 72,
  desde: '2026-10-10T00:00:00Z',
  hasta: '2026-10-13T00:00:00Z',
  fuente: 'NASA IMERG Early',
  geojson: {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: { type: 'Polygon', coordinates: [] }, properties: { geometryRef: 'a', acumuladoMm: 30, granulos: 100, esperados: 144, cobertura: 90, parcial: false } },
    ],
  },
}

describe('CapaLluviaObservada', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(RESPUESTA) }))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('no renderiza nada ni pide datos cuando la capa está apagada', () => {
    const { container } = render(<CapaLluviaObservada visible={false} horas={72} />)

    expect(container.innerHTML).toBe('')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('pide la ventana de 72 horas y renderiza la fuente y las capas de relleno y borde parcial', async () => {
    render(<CapaLluviaObservada visible horas={72} />)

    await waitFor(() => expect(screen.getByTestId('source')).toBeTruthy())
    expect(fetchMock.mock.calls[0][0]).toBe('/api/infraestructura/peligro/observado-grilla?horas=72')
    const capas = screen.getAllByTestId('layer').map((nodo) => JSON.parse(nodo.getAttribute('data-props') ?? '{}'))
    expect(capas.map((capa) => capa.type)).toEqual(['fill', 'line'])
    expect(capas[0].paint['fill-opacity']).toEqual(['case', ['boolean', ['get', 'parcial'], false], 0.35, 0.6])
    expect(capas[1].filter).toEqual(['==', ['get', 'parcial'], true])
    expect(capas[1].paint['line-dasharray']).toEqual([2, 2])
  })

  it('vuelve a pedir los datos al cambiar la ventana a 24 horas y avisa la fecha de corte', async () => {
    const onMeta = vi.fn()
    const { rerender } = render(<CapaLluviaObservada visible horas={72} onMeta={onMeta} />)
    await waitFor(() => expect(onMeta).toHaveBeenCalledWith({ hasta: '2026-10-13T00:00:00Z', horas: 72 }))

    rerender(<CapaLluviaObservada visible horas={24} onMeta={onMeta} />)
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith('/api/infraestructura/peligro/observado-grilla?horas=24', expect.anything()))
  })

  it('ignora errores de red sin romper el mapa', async () => {
    fetchMock.mockImplementation(() => Promise.reject(new Error('red')))
    const { container } = render(<CapaLluviaObservada visible horas={24} />)

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(container.querySelector('[data-testid="source"]')).toBeNull()
  })

  it('expone las clases de lluvia con su umbral y etiqueta en orden creciente', () => {
    expect(CLASES_LLUVIA.map((clase) => clase.desde)).toEqual([10, 25, 50, 100, 200])
    expect(CLASES_LLUVIA[0]).toEqual({ desde: 10, color: '#bfdbfe', etiqueta: '10–25 mm' })
    expect(CLASES_LLUVIA[4].etiqueta).toBe('200 mm o más')
  })
})
