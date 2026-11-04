// @vitest-environment jsdom
import * as React from 'react'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NatalidadMapClient } from './map-client'

vi.mock('next/dynamic', () => ({ default: (loader: () => Promise<unknown>) => {
  const Component = React.lazy(async () => {
    const result = await loader() as React.ComponentType<object> | { default: React.ComponentType<object> }
    return typeof result === 'function' ? { default: result } : result
  })
  return function Dynamic(props: object) {
    return <React.Suspense fallback="Loading"><Component {...props} /></React.Suspense>
  }
} }))
vi.mock('@/lib/map-worker', () => ({ ensureMapWorker: vi.fn() }))
vi.mock('react-map-gl/maplibre', () => ({
  default: React.forwardRef(function Map({ children, onClick }: { children: React.ReactNode; onClick: (event: unknown) => void }, ref) {
    React.useImperativeHandle(ref, () => ({ getMap: () => ({ resize() {}, fitBounds() {}, stop() {} }) }))
    return <div data-testid="map-canvas"><button onClick={() => onClick({
      lngLat: { lng: -58.8, lat: -27.5 },
      features: [{ layer: { id: 'natalidad-departamentos-relleno' }, properties: { clave: 'CAPITAL' } }],
    })}>Inspect Capital</button>{children}</div>
  }),
  Source: ({ id, data, children }: { id: string; data: unknown; children: React.ReactNode }) =>
    <div><output data-testid={id}>{typeof data === 'object' ? JSON.stringify(data) : ''}</output>{children}</div>,
  Layer: () => null,
  NavigationControl: () => null,
  Popup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/components/mapas/estadisticas-natalidad-graficos', () => ({
  GraficoSerieNacimientos: ({ puntos, medida }: { puntos: unknown; medida: string }) => <output data-testid="birth-chart" data-medida={medida}>{JSON.stringify(puntos)}</output>,
  GraficoVariacionPorDepartamento: () => null,
  GraficoNacidosPorSeccion: () => null,
}))
const read = (path: string) => JSON.parse(readFileSync(`public${path}`, 'utf8'))
const renaper = read('/data/natalidad/renaper.json')
let failRenaper = false
beforeEach(() => {
  failRenaper = false
  window.history.replaceState({}, '', '/#mapa')
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (failRenaper && url.endsWith('/renaper.json')) return { ok: false, status: 503 }
    return { ok: true, status: 200, json: async () => read(url) }
  }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const polygons = () => JSON.parse(screen.getByTestId('natalidad-departamentos-src').textContent!)
const capital = () => polygons().features.find((f: { properties: { clave: string } }) => f.properties.clave === 'CAPITAL').properties

describe('complete natalidad source integration', () => {
  it('drives the actual map controls, choropleth, variation and statistics from RENAPER through 2025', async () => {
    const user = userEvent.setup()
    render(<NatalidadMapClient />)
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Año' }).textContent).toContain('2025'))
    const map = screen.getByTestId('map-canvas')
    expect(screen.getByText(/Total provincial 2025:/)).toBeTruthy()
    expect(capital().valor).toBe(renaper.departamentos.CAPITAL.serie['2025'])
    expect(capital().color).not.toBe('#d1d5db')
    await user.click(screen.getByRole('button', { name: 'Inspect Capital' }))
    expect(screen.getByRole('heading', { name: 'Capital' })).toBeTruthy()
    expect(screen.getByText('Nacimientos identificados 2025:')).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Serie de nacimientos 2012–2025' })).toBeTruthy()
    await user.click(screen.getByRole('combobox', { name: 'Año' }))
    await user.click(await screen.findByRole('option', { name: '2024' }))
    expect(capital().valor).toBe(renaper.departamentos.CAPITAL.serie['2024'])
    await user.click(screen.getByRole('button', { name: 'Variación %' }))
    expect(screen.getByRole('combobox', { name: 'Desde' }).textContent).toContain('2012')
    expect(screen.getByRole('combobox', { name: 'Hasta' }).textContent).toContain('2025')
    const serie = renaper.departamentos.CAPITAL.serie
    expect(capital().valor).toBeCloseTo((serie['2025'] - serie['2012']) / serie['2012'] * 100)
    await user.click(screen.getByRole('tab', { name: 'Estadísticas' }))
    expect(await screen.findByText('Nacimientos identificados 2025')).toBeTruthy()
    const puntos = JSON.parse(screen.getByTestId('birth-chart').textContent!)
    expect(puntos.at(-1)).toEqual({ anio: 2025, valor: 12077 })
    expect(puntos).toHaveLength(14)
    expect(screen.getByTestId('birth-chart')).toHaveAttribute('data-medida', 'Nacimientos identificados')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Fuente de natalidad' }), 'deis')
    expect(await screen.findByText('Nacidos vivos 2023')).toBeTruthy()
    expect(JSON.parse(screen.getByTestId('birth-chart').textContent!).at(-1).anio).toBe(2023)
    await user.click(screen.getByRole('tab', { name: 'Mapa' }))
    expect(screen.getByRole('combobox', { name: 'Hasta' }).textContent).toContain('2023')
    expect(screen.getByTestId('map-canvas')).toBe(map)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Fuente de natalidad' }), 'renaper')
    expect(screen.getByRole('combobox', { name: 'Hasta' }).textContent).toContain('2025')
    expect(screen.getByTestId('map-canvas')).toBe(map)
  })

  it('reports RENAPER failure instead of silently falling back to 2023 and permits explicit DEIS selection', async () => {
    failRenaper = true
    const user = userEvent.setup()
    render(<NatalidadMapClient />)
    expect(await screen.findByRole('alert')).toHaveTextContent('RENAPER')
    expect(screen.queryByTestId('map-canvas')).toBeNull()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Fuente de natalidad' }), 'deis')
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Año' }).textContent).toContain('2023'))
  })
})
