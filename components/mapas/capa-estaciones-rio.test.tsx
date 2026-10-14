// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { CapaEstacionesRio, etiquetaEstadoAltura, COLOR_ESTADO_ALTURA, formatearFechaLocal } from './capa-estaciones-rio'
import { registrarInsignias } from '@/lib/mapas/insignias-mapa'

const mapa = vi.hoisted(() => {
  type Manejador = (evento: unknown) => void
  const manejadores = new Map<string, Manejador[]>()
  const fake = {
    on: (tipo: string, capa: string, fn: Manejador) => {
      const clave = `${tipo}:${capa}`
      manejadores.set(clave, [...(manejadores.get(clave) ?? []), fn])
    },
    off: () => {},
    getCanvas: () => ({ style: { cursor: '' } }),
    getMap: () => fake,
    hasImage: () => false,
    addImage: () => {},
    emitir: (tipo: string, capa: string, evento: unknown) => {
      for (const fn of manejadores.get(`${tipo}:${capa}`) ?? []) fn(evento)
    },
    limpiar: () => manejadores.clear(),
  }
  return fake
})

vi.mock('react-map-gl/maplibre', () => ({
  Source: ({ id, data, children }: { id: string; data: unknown; children: React.ReactNode }) => (
    <div data-testid="source" data-props={JSON.stringify({ id, data })}>
      {children}
    </div>
  ),
  Layer: (props: Record<string, unknown>) => <div data-testid="layer" data-props={JSON.stringify(props)} />,
  Popup: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid={className === 'mapa-tooltip' ? 'tooltip' : 'popup'}>{children}</div>
  ),
  useMap: () => ({ current: mapa }),
}))

vi.mock('@/lib/mapas/insignias-mapa', () => ({
  registrarInsignias: vi.fn(),
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
    lecturaVencida: false,
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
    lecturaVencida: true,
    estado: 'sin_dato',
    tendencia: 'sin_dato',
  },
]

function ultimaCapa(): { id: string; beforeId?: string; layout: Record<string, unknown>; paint: Record<string, unknown> } {
  const nodos = screen.getAllByTestId('layer')
  return JSON.parse(nodos[nodos.length - 1].dataset.props ?? '{}')
}

function datosFuente(): { id: string; data: { features: Array<{ properties: Record<string, unknown> }> } } {
  return JSON.parse(screen.getByTestId('source').dataset.props ?? '{}')
}

describe('CapaEstacionesRio', () => {
  beforeEach(() => {
    vi.mocked(registrarInsignias).mockResolvedValue(undefined)
    mapa.limpiar()
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ estaciones: ESTACIONES }),
    }) as unknown as typeof fetch
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('pasa una feature por estación con su insignia de estado', async () => {
    render(<CapaEstacionesRio visible />)

    await screen.findByTestId('source')
    const { data } = datosFuente()
    expect(data.features).toHaveLength(2)
    expect(data.features[0].properties).toMatchObject({
      estacionId: 'rosario',
      estado: 'evacuacion',
      insignia: 'estacion-evacuacion',
      altura: '4,12 m',
    })
    expect(data.features[1].properties).toMatchObject({
      estacionId: 'corrientes',
      insignia: 'estacion-sin-dato',
      altura: '',
    })
    expect(registrarInsignias).toHaveBeenCalledWith(
      expect.anything(),
      ['estacion-evacuacion', 'estacion-alerta', 'estacion-normal', 'estacion-sin-dato'],
    )
  })

  it('usa una capa symbol con beforeId y solapamiento de iconos permitido', async () => {
    render(<CapaEstacionesRio visible beforeId="labels" />)

    await screen.findByTestId('layer')
    const capa = ultimaCapa()
    expect(capa.id).toBe('estaciones-rio-simbolos')
    expect(capa.beforeId).toBe('labels')
    expect(capa.layout['icon-allow-overlap']).toBe(true)
    expect(capa.layout['icon-image']).toEqual(['get', 'insignia'])
  })

  it('no renderiza nada cuando la capa está oculta', () => {
    const { container } = render(<CapaEstacionesRio visible={false} />)

    expect(container.innerHTML).toBe('')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('muestra "Sin dato" y la fila de lectura desactualizada al hacer clic', async () => {
    render(<CapaEstacionesRio visible />)

    await screen.findByTestId('source')
    act(() => {
      mapa.emitir('click', 'estaciones-rio-simbolos', { features: [{ properties: { estacionId: 'corrientes' } }] })
    })

    const popup = await waitFor(() => screen.getByTestId('popup'))
    expect(within(popup).getByText('Corrientes')).toBeTruthy()
    expect(within(popup).getByText('Altura: Sin dato')).toBeTruthy()
    expect(within(popup).getByText('Lectura desactualizada: se muestra como sin dato.')).toBeTruthy()
  })

  it('no muestra la fila de lectura desactualizada si la lectura está vigente', async () => {
    render(<CapaEstacionesRio visible />)

    await screen.findByTestId('source')
    act(() => {
      mapa.emitir('click', 'estaciones-rio-simbolos', { features: [{ properties: { estacionId: 'rosario' } }] })
    })

    const popup = await waitFor(() => screen.getByTestId('popup'))
    expect(within(popup).getByText('Altura: 4,12 m')).toBeTruthy()
    expect(within(popup).queryByText('Lectura desactualizada: se muestra como sin dato.')).toBeNull()
  })

  it('muestra el tooltip de una línea al entrar y lo oculta al salir', async () => {
    render(<CapaEstacionesRio visible />)

    await screen.findByTestId('source')
    act(() => {
      mapa.emitir('mouseenter', 'estaciones-rio-simbolos', { features: [{ properties: { estacionId: 'corrientes' } }] })
    })
    expect(
      (await screen.findByTestId('tooltip')).textContent,
    ).toBe('Estación Prefectura Corrientes · sin dato · Sin dato — clic para ver detalle')

    act(() => {
      mapa.emitir('mouseleave', 'estaciones-rio-simbolos', {})
    })
    await waitFor(() => expect(screen.queryByTestId('tooltip')).toBeNull())
  })

  it('no rompe la capa si la petición falla', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('red caída')) as unknown as typeof fetch
    render(<CapaEstacionesRio visible />)

    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    await waitFor(() => expect(datosFuente().data.features).toHaveLength(0))
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

describe('formatearFechaLocal', () => {
  it('convierte ISO UTC a hora local de Buenos Aires', () => {
    expect(formatearFechaLocal('2026-10-13T17:00:00.000Z')).toBe('13/10 14:00')
  })

  it('devuelve el texto libre sin cambios', () => {
    expect(formatearFechaLocal('2026-10-06 (aprox.)')).toBe('2026-10-06 (aprox.)')
  })
})
