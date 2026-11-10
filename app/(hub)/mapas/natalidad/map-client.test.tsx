// @vitest-environment jsdom
import * as React from 'react'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
  default: React.forwardRef(function Map({ children, onClick, onMouseMove }: { children: React.ReactNode; onClick: (event: unknown) => void; onMouseMove: (event: unknown) => void }, ref) {
    React.useImperativeHandle(ref, () => ({ getMap: () => ({ resize() {}, fitBounds() {}, stop() {} }), flyTo() {} }))
    return <div data-testid="map-canvas"><button onClick={() => onClick({ lngLat: { lng: -58.8, lat: -27.5 }, features: [{ layer: { id: 'natalidad-escuelas' }, geometry: { type: 'Point', coordinates: [-58.8, -27.5] }, properties: { cueAnexo: '1800746-00', nombre: 'Escuela de prueba', sector: '', ofertaTipo: [], domicilio: '', localidad: 'Capital', departamento: 'Capital', tienePadron: false, niveles: [] } }] })}>Inspect school</button><button onClick={() => onMouseMove({ lngLat: { lng: -58.8, lat: -27.5 }, features: [{ layer: { id: 'natalidad-departamentos-relleno' }, properties: { clave: 'CAPITAL' } }] })}>Hover Capital</button><button onClick={() => onMouseMove({ lngLat: { lng: -58.8, lat: -27.5 }, features: [] })}>Move away</button><button onClick={() => onClick({
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
  GraficoMatriculaObservada: ({ puntos }: { puntos: unknown }) => <output data-testid="enrollment-chart">{JSON.stringify(puntos)}</output>,
  GraficoAlumnosPorSeccion: ({ filas }: { filas: unknown }) => <output data-testid="ratio-chart">{JSON.stringify(filas)}</output>,
}))
const read = (path: string) => JSON.parse(readFileSync(`public${path}`, 'utf8'))
const renaper = read('/data/natalidad/renaper.json')
let failRenaper = false
let matriculaAlterada: ReturnType<typeof read> | null = null
beforeEach(() => {
  failRenaper = false
  matriculaAlterada = null
  window.history.replaceState({}, '', '/#mapa')
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (failRenaper && url.endsWith('/renaper.json')) return { ok: false, status: 503 }
    return { ok: true, status: 200, json: async () => url.endsWith('/matricula.json') && matriculaAlterada ? matriculaAlterada : read(url) }
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
    await user.click((await screen.findAllByRole('option', { name: '2024' })).at(-1)!)
    expect(capital().valor).toBe(renaper.departamentos.CAPITAL.serie['2024'])
    await user.click(screen.getByRole('button', { name: 'Variación %' }))
    expect(screen.getByRole('combobox', { name: 'Desde' }).textContent).toContain('2012')
    expect(screen.getByRole('combobox', { name: 'Hasta' }).textContent).toContain('2025')
    const serie = renaper.departamentos.CAPITAL.serie
    expect(capital().valor).toBeCloseTo((serie['2025'] - serie['2012']) / serie['2012'] * 100)
    expect(screen.getByText('Nacimientos identificados 2025:')).toBeTruthy()
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

it('keeps clicked department detail actionable after pointer movement and leaving the map', async () => {
  const user = userEvent.setup()
  render(<NatalidadMapClient />)
  await screen.findByRole('button', { name: 'Inspect Capital' })
  await user.click(screen.getByRole('button', { name: 'Hover Capital' }))
  expect(screen.getByText(/Seleccione para ver el detalle/)).toBeTruthy()
  expect(screen.queryByRole('heading', { name: 'Capital' })).toBeNull()
  await user.click(screen.getByRole('button', { name: 'Inspect Capital' }))
  await user.click(screen.getByRole('button', { name: 'Move away' }))
  fireEvent.mouseLeave(screen.getByTestId('map-canvas').parentElement!)
  expect(screen.getByRole('heading', { name: 'Capital' })).toBeTruthy()
  expect(within(screen.getByRole('heading', { name: 'Capital' }).parentElement!).getByLabelText('Ciclo lectivo de matrícula')).toBeTruthy()
  await user.click(screen.getByRole('button', { name: 'Cerrar detalle del departamento' }))
  expect(screen.queryByRole('heading', { name: 'Capital' })).toBeNull()
})

it('shows observed enrollment evolution and territorial comparison in statistics', async () => {
  const user = userEvent.setup()
  render(<NatalidadMapClient />)
  await screen.findByRole('button', { name: 'Inspect Capital' })
  await user.click(screen.getByRole('tab', { name: 'Estadísticas' }))
  expect(await screen.findByRole('heading', { name: /Evolución de matrícula observada/ })).toBeTruthy()
  expect(screen.getByRole('heading', { name: /Alumnos por sección activa por departamento/ })).toBeTruthy()
  expect(within(screen.getByTestId('pestana-estadisticas')).getByText(/no mide capacidad ni vacantes/i)).toBeTruthy()
})


it('maps CGE enrollment and active-section ratios with their own cycle and legend', async () => {
  const user = userEvent.setup()
  render(<NatalidadMapClient />)
  await screen.findByRole('button', { name: 'Inspect Capital' })
  await user.selectOptions(screen.getByLabelText('Indicador del mapa'), 'matricula')
  await user.selectOptions(screen.getByLabelText('Ciclo CGE del mapa'), '2023')
  const matricula = read('/data/natalidad/matricula.json')
  expect(capital().valor).toBe(matricula.departamentos.CAPITAL['2023'].matricula)
  expect(capital().color).not.toBe('#d1d5db')
  expect(screen.getByText(/Matrícula CGE 2023.*cuantiles/)).toBeTruthy()
  await user.click(screen.getByRole('button', { name: 'Hover Capital' }))
  expect(screen.getByText(new RegExp(`Capital.*${matricula.departamentos.CAPITAL['2023'].matricula.toLocaleString('es-AR')}`))).toBeTruthy()
  await user.selectOptions(screen.getByLabelText('Indicador del mapa'), 'ratio')
  expect(capital().valor).toBeCloseTo(matricula.departamentos.CAPITAL['2023'].matricula / matricula.departamentos.CAPITAL['2023'].secciones)
  expect(screen.getByText(/Alumnos por sección activa CGE 2023.*cuantiles/)).toBeTruthy()
})

it('opens departments from the keyboard and closes details with Escape', async () => {
  const user = userEvent.setup()
  render(<NatalidadMapClient />)
  await screen.findByRole('button', { name: 'Inspect Capital' })
  await user.selectOptions(screen.getByLabelText('Seleccionar departamento'), 'CAPITAL')
  expect(screen.getByRole('heading', { name: 'Capital' })).toBeTruthy()
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('heading', { name: 'Capital' })).toBeNull()
  await waitFor(() => expect(screen.getByLabelText('Seleccionar departamento')).toHaveFocus())
})

it('renders observed enrollment and territorial ratio chart data', async () => {
  const user = userEvent.setup()
  render(<NatalidadMapClient />)
  await screen.findByRole('button', { name: 'Inspect Capital' })
  await user.click(screen.getByRole('tab', { name: 'Estadísticas' }))
  const matricula = read('/data/natalidad/matricula.json')
  const puntos = JSON.parse((await screen.findByTestId('enrollment-chart')).textContent!)
  expect(puntos.find((p: { anio: number }) => p.anio === 2026).matricula).toBe(matricula.provincia['2026'].matricula)
  const filas = JSON.parse(screen.getByTestId('ratio-chart').textContent!)
  expect(filas.find((p: { clave: string }) => p.clave === 'CAPITAL').valor).toBeCloseTo(matricula.departamentos.CAPITAL['2026'].matricula / matricula.departamentos.CAPITAL['2026'].secciones)
})


it('renders missing department enrollment as no data rather than zero', async () => {
  matriculaAlterada = read('/data/natalidad/matricula.json')
  delete matriculaAlterada.departamentos.CAPITAL['2023']
  matriculaAlterada.departamentos.CAPITAL['2026'].secciones = 0
  const user = userEvent.setup()
  render(<NatalidadMapClient />)
  await screen.findByRole('button', { name: 'Inspect Capital' })
  await user.selectOptions(screen.getByLabelText('Indicador del mapa'), 'matricula')
  await user.selectOptions(screen.getByLabelText('Ciclo CGE del mapa'), '2023')
  expect(capital().valor).toBeNull()
  expect(capital().color).toBe('#9ca3af')
  await user.click(screen.getByRole('button', { name: 'Hover Capital' }))
  expect(screen.getByText(/Capital.*Sin dato/)).toBeTruthy()
  await user.selectOptions(screen.getByLabelText('Ciclo CGE del mapa'), '2026')
  await user.selectOptions(screen.getByLabelText('Indicador del mapa'), 'ratio')
  expect(capital().valor).toBeNull()
  expect(capital().color).toBe('#9ca3af')
})

it('keeps school details scrollable and closes them with Escape', async () => {
  const user = userEvent.setup()
  render(<NatalidadMapClient />)
  await screen.findByRole('button', { name: 'Inspect school' })
  await user.click(screen.getByRole('button', { name: 'Inspect school' }))
  const heading = screen.getByRole('heading', { name: 'Escuela de prueba' })
  expect(heading.parentElement?.className).toMatch(/detalle/)
  expect(screen.getByRole('button', { name: 'Cerrar detalle de la escuela' })).toHaveFocus()
  await user.selectOptions(within(heading.parentElement!).getByLabelText('Ciclo lectivo de matrícula'), '2025')
  await user.selectOptions(screen.getByLabelText('Indicador del mapa'), 'matricula')
  expect(screen.getByLabelText('Ciclo CGE del mapa')).toHaveValue('2025')
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('heading', { name: 'Escuela de prueba' })).toBeNull()
})

it('keeps the map and selected department on the same CGE cycle in both directions', async () => {
  const user = userEvent.setup()
  render(<NatalidadMapClient />)
  await screen.findByRole('button', { name: 'Inspect Capital' })
  await user.selectOptions(screen.getByLabelText('Indicador del mapa'), 'matricula')
  await user.selectOptions(screen.getByLabelText('Ciclo CGE del mapa'), '2025')
  await user.selectOptions(screen.getByLabelText('Seleccionar departamento'), 'GOYA')
  const detail = screen.getByRole('region', { name: 'Detalle de Goya' })
  expect(within(detail).getByLabelText('Ciclo lectivo de matrícula')).toHaveValue('2025')
  expect(within(detail).getByText('10.532 estudiantes')).toBeTruthy()
  expect(within(detail).getByText(/898 secciones activas.*11\.7/)).toBeTruthy()
  await user.selectOptions(within(detail).getByLabelText('Ciclo lectivo de matrícula'), '2023')
  expect(screen.getByLabelText('Ciclo CGE del mapa')).toHaveValue('2023')
  expect(within(detail).getByText(/Matrícula CGE 2023:/)).toBeTruthy()
  expect(within(detail).getByText('11.076 estudiantes')).toBeTruthy()
  expect(within(detail).getByText(/905 secciones activas.*12\.2/)).toBeTruthy()
  const matricula = read('/data/natalidad/matricula.json')
  const goya = polygons().features.find((f: { properties: { clave: string } }) => f.properties.clave === 'GOYA').properties
  expect(goya.valor).toBe(matricula.departamentos.GOYA['2023'].matricula)
})

it('renders persistent details inside the map shell rather than the geographic popup', async () => {
  const user = userEvent.setup()
  render(<NatalidadMapClient />)
  await screen.findByRole('button', { name: 'Inspect Capital' })
  await user.selectOptions(screen.getByLabelText('Seleccionar departamento'), 'CAPITAL')
  const detail = screen.getByRole('region', { name: 'Detalle de Capital' })
  expect(screen.getByTestId('map-canvas').contains(detail)).toBe(false)
  expect(detail.className).toMatch(/detalle/)
  const scroll = within(detail).getByTestId('detalle-contenido')
  expect(scroll).not.toBe(detail)
  expect(scroll.className).toMatch(/detalleContenido/)
})


it('starts mobile controls and legend collapsed while leaving them available', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }))
  const user = userEvent.setup()
  render(<NatalidadMapClient />)
  await screen.findByRole('button', { name: 'Inspect Capital' })
  const controls = screen.getByText('Controles y fuentes').closest('details')!
  const legend = screen.getByText('Referencias').closest('details')!
  expect(controls).not.toHaveAttribute('open')
  expect(legend).not.toHaveAttribute('open')
  await user.click(screen.getByText('Controles y fuentes'))
  expect(screen.getByLabelText('Indicador del mapa')).toBeTruthy()
})
