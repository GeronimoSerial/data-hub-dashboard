// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { CapaEstacionesRio, etiquetaEstadoAltura, COLOR_ESTADO_ALTURA } from './capa-estaciones-rio'

vi.mock('react-map-gl/maplibre', () => ({
  Marker: ({ children }: { children: React.ReactNode }) => <div data-testid="marker">{children}</div>,
  Popup: ({ children }: { children: React.ReactNode }) => <div data-testid="popup">{children}</div>,
}))

const ESTACIONES = [
  {
    estacionId: 'rosario',
    nombre: 'Rosario',
    rio: 'parana',
    rol: 'referencia',
    lat: -32.95,
    lon: -60.65,
    coordenadasVerificadas: false,
    lectura: {
      lecturaM: 4.12,
      variacionM: 0.2,
      periodoHoras: 24,
      medidaEn: '2026-10-12T12:00:00-03:00',
      estadoPublicado: 'evacuacion',
      alertaM: 3.5,
      evacuacionM: 4,
      inconsistente: false,
    },
    estado: 'evacuacion',
    tendencia: 'crece',
  },
  {
    estacionId: 'corrientes',
    nombre: 'Corrientes',
    rio: 'parana',
    rol: 'referencia',
    lat: -27.47,
    lon: -58.83,
    coordenadasVerificadas: false,
    lectura: null,
    estado: 'sin_dato',
    tendencia: 'sin_dato',
  },
]

describe('CapaEstacionesRio', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ estaciones: ESTACIONES }),
    }) as unknown as typeof fetch
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('muestra un marcador accesible por estación con el estado de altura', async () => {
    render(<CapaEstacionesRio visible />)

    expect(await screen.findByRole('button', { name: 'Estación Rosario: Evacuación' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Estación Corrientes: Sin dato' })).toBeTruthy()
  })

  it('no renderiza nada cuando la capa está oculta', () => {
    const { container } = render(<CapaEstacionesRio visible={false} />)

    expect(container.innerHTML).toBe('')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('muestra "Sin dato" en el popup cuando la estación no tiene lectura', async () => {
    render(<CapaEstacionesRio visible />)

    fireEvent.click(await screen.findByRole('button', { name: 'Estación Corrientes: Sin dato' }))

    const popup = await waitFor(() => screen.getByTestId('popup'))
    expect(within(popup).getByText('Corrientes')).toBeTruthy()
    expect(within(popup).getByText('Altura: Sin dato')).toBeTruthy()
  })

  it('no rompe la capa si la petición falla', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('red caída')) as unknown as typeof fetch
    const { container } = render(<CapaEstacionesRio visible />)

    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(container.querySelectorAll('button').length).toBe(0)
  })
})

describe('helpers de estado de altura', () => {
  it('etiqueta cada estado en español', () => {
    expect(etiquetaEstadoAltura('evacuacion')).toBe('Evacuación')
    expect(etiquetaEstadoAltura('alerta')).toBe('Alerta')
    expect(etiquetaEstadoAltura('normal')).toBe('Normal')
    expect(etiquetaEstadoAltura('sin_dato')).toBe('Sin dato')
  })

  it('asigna el color de cada estado', () => {
    expect(COLOR_ESTADO_ALTURA).toEqual({
      evacuacion: '#b91c1c',
      alerta: '#f59e0b',
      normal: '#15803d',
      sin_dato: '#9ca3af',
    })
  })
})
