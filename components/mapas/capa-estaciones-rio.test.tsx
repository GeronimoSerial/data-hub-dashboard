// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { CapaEstacionesRio, etiquetaEstadoAltura, COLOR_ESTADO_ALTURA, formatearFechaLocal } from './capa-estaciones-rio'
import { registrarSimbolosEstacion } from '@/lib/mapas/insignias-mapa'

const mapa = vi.hoisted(() => {
  type Manejador = (evento: unknown) => void
  const manejadores = new Map<string, Manejador[]>()
  const fake = {
    on: (tipo: string, capa: string | Manejador, fn?: Manejador) => {
      const clave = typeof capa === 'string' ? `${tipo}:${capa}` : `${tipo}:`
      const manejador = typeof capa === 'string' ? fn! : capa
      manejadores.set(clave, [...(manejadores.get(clave) ?? []), manejador])
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

vi.mock('@/lib/mapas/insignias-mapa', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/mapas/insignias-mapa')>()),
  registrarSimbolosEstacion: vi.fn(),
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

function capaPorId(id: string): { id: string; beforeId?: string; minzoom?: number; layout: Record<string, unknown>; paint: Record<string, unknown> } {
  const capa = screen.getAllByTestId('layer').map((nodo) => JSON.parse(nodo.dataset.props ?? '{}')).find((c) => c.id === id)
  if (!capa) throw new Error(`sin capa ${id}`)
  return capa
}

function ultimaCapa(): { id: string; beforeId?: string; layout: Record<string, unknown>; paint: Record<string, unknown> } {
  const nodos = screen.getAllByTestId('layer')
  return JSON.parse(nodos[nodos.length - 1].dataset.props ?? '{}')
}

function datosFuente(): { id: string; data: { features: Array<{ properties: Record<string, unknown> }> } } {
  return JSON.parse(screen.getByTestId('source').dataset.props ?? '{}')
}

describe('CapaEstacionesRio', () => {
  beforeEach(() => {
    vi.mocked(registrarSimbolosEstacion).mockResolvedValue(undefined)
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
      insignia: 'estacion-pastilla-evacuacion',
      marcador: 'estacion-marcador-evacuacion',
      texto: '↑ 4,12 m',
    })
    expect(data.features[1].properties).toMatchObject({
      estacionId: 'corrientes',
      insignia: 'estacion-pastilla-sin-dato',
      marcador: 'estacion-marcador-sin-dato',
      texto: 's/d',
    })
    expect(registrarSimbolosEstacion).toHaveBeenCalledWith(expect.anything())
  })

  it('con lectura vencida pinta el último estado conocido, atenuado y con su antigüedad', async () => {
    const vencida = {
      ...ESTACIONES[0],
      estacionId: 'goya',
      nombre: 'Goya',
      lectura: { ...ESTACIONES[0].lectura!, lecturaM: 3.7 },
      lecturaVencida: true,
      estado: 'sin_dato',
      tendencia: 'sin_dato',
      estadoUltimaLectura: 'alerta',
      horasDesdeLectura: 26,
    }
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ estaciones: [vencida, ESTACIONES[1]] }) }) as unknown as typeof fetch
    render(<CapaEstacionesRio visible />)

    await screen.findByTestId('source')
    const { data } = datosFuente()
    expect(data.features[0].properties).toMatchObject({
      estado: 'alerta',
      vencida: true,
      insignia: 'estacion-pastilla-alerta',
      marcador: 'estacion-marcador-alerta',
      texto: '3,70 m · 26 h',
    })
    // Sin lectura de verdad: sigue s/d y sin marca de vencida.
    expect(data.features[1].properties).toMatchObject({ estado: 'sin_dato', vencida: false, texto: 's/d' })
    expect(capaPorId('estaciones-rio-simbolos').paint['icon-opacity']).toEqual(['case', ['get', 'vencida'], 0.5, 1])
  })

  it('vuelve a registrar las insignias cuando cambia el estilo del mapa', async () => {
    render(<CapaEstacionesRio visible />)
    await waitFor(() => expect(registrarSimbolosEstacion).toHaveBeenCalled())
    const antes = vi.mocked(registrarSimbolosEstacion).mock.calls.length
    act(() => mapa.emitir('styledata', '', {}))
    expect(vi.mocked(registrarSimbolosEstacion).mock.calls.length).toBeGreaterThan(antes)
  })

  it('usa una capa symbol con beforeId y solapamiento de iconos permitido', async () => {
    render(<CapaEstacionesRio visible beforeId="labels" />)

    await screen.findAllByTestId('layer')
    const marcador = ultimaCapa()
    expect(marcador.id).toBe('estaciones-rio-simbolos')
    expect(marcador.beforeId).toBe('labels')
    expect(marcador.layout['icon-allow-overlap']).toBe(true)
    expect(marcador.layout['icon-anchor']).toBe('bottom')
    expect(marcador.layout['icon-image']).toEqual(['get', 'marcador'])
    const pastilla = capaPorId('estaciones-rio-pastillas')
    expect(pastilla.beforeId).toBe('labels')
    expect(pastilla.minzoom).toBeUndefined()
    expect(pastilla.layout['icon-text-fit']).toBe('both')
    expect(pastilla.layout['icon-image']).toEqual(['get', 'insignia'])
    expect(pastilla.layout['text-field']).toEqual(['get', 'texto'])
  })

  it('pide la fuente Noto Sans que sirve el basemap (no el Open Sans por defecto de MapLibre)', async () => {
    render(<CapaEstacionesRio visible />)

    await screen.findAllByTestId('layer')
    expect(capaPorId('estaciones-rio-pastillas').layout['text-font']).toEqual(['Noto Sans Bold'])
  })

  it('sin beforeId mantiene las estaciones por encima de capas agregadas después (clusters de escuelas)', async () => {
    const capas = [{ id: 'basemap' }, { id: 'estaciones-rio-simbolos' }, { id: 'infra-partes-cluster' }]
    const moveLayer = vi.fn((id: string) => {
      const i = capas.findIndex((c) => c.id === id)
      capas.push(...capas.splice(i, 1))
    })
    const extra = {
      getStyle: () => ({ layers: capas }),
      getLayer: (id: string) => capas.find((c) => c.id === id),
      moveLayer,
    }
    Object.assign(mapa, extra)
    try {
      render(<CapaEstacionesRio visible />)
      await screen.findAllByTestId('layer')
      expect(ultimaCapa().beforeId).toBeUndefined()

      act(() => mapa.emitir('styledata', '', {}))
      await waitFor(() => expect(moveLayer).toHaveBeenCalledWith('estaciones-rio-simbolos'))
      expect(capas.at(-1)?.id).toBe('estaciones-rio-simbolos')

      // Ya arriba: no vuelve a moverla (evita un bucle de styledata).
      moveLayer.mockClear()
      act(() => mapa.emitir('styledata', '', {}))
      expect(moveLayer).not.toHaveBeenCalled()
    } finally {
      for (const clave of Object.keys(extra)) delete (mapa as Record<string, unknown>)[clave]
    }
  })

  it('no renderiza nada cuando la capa está oculta', () => {
    const { container } = render(<CapaEstacionesRio visible={false} />)

    expect(container.innerHTML).toBe('')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('con lectura vencida no muestra un aviso: atenúa el valor y deja la fecha en el tooltip', async () => {
    render(<CapaEstacionesRio visible />)

    await screen.findByTestId('source')
    act(() => {
      mapa.emitir('click', 'estaciones-rio-simbolos', { features: [{ properties: { estacionId: 'corrientes' } }] })
    })

    const popup = await waitFor(() => screen.getByTestId('popup'))
    expect(within(popup).getByText('Corrientes')).toBeTruthy()
    expect(within(popup).getByText('Altura del río: sin dato')).toBeTruthy()
    expect(popup.textContent).not.toMatch(/desactualizad/i)
    expect(popup.querySelector('.dato-fechado--vencido')).not.toBeNull()
    // La procedencia no va en el texto: queda detrás del ícono de info.
    expect(popup.textContent).not.toContain('no verificada')
    expect(within(popup).getByRole('note')).toHaveAttribute('title', 'Ubicación declarada por el publicador (no verificada).')
  })

  it('con lectura vigente dice la altura del río explícita, el estado y los umbrales', async () => {
    render(<CapaEstacionesRio visible />)

    await screen.findByTestId('source')
    act(() => {
      mapa.emitir('click', 'estaciones-rio-simbolos', { features: [{ properties: { estacionId: 'rosario' } }] })
    })

    const popup = await waitFor(() => screen.getByTestId('popup'))
    expect(within(popup).getByText('Altura del río: 4,12 m')).toBeTruthy()
    expect(popup.querySelector('.dato-fechado--vencido')).toBeNull()
    expect(popup.querySelector('.dato-fechado')?.getAttribute('title')).toMatch(/^Actualizado \d{2}\/\d{2} \d{2}:\d{2}$/)
  })

  it('muestra el tooltip de una línea al entrar y lo oculta al salir', async () => {
    render(<CapaEstacionesRio visible />)

    await screen.findByTestId('source')
    act(() => {
      mapa.emitir('mouseenter', 'estaciones-rio-simbolos', { features: [{ properties: { estacionId: 'corrientes' } }] })
    })
    expect(
      (await screen.findByTestId('tooltip')).textContent,
    ).toBe('Estación Prefectura Corrientes · Altura del río: sin dato · Sin dato — clic para ver detalle')

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

describe('ladosPastilla', () => {
  it('flips the western neighbour to the left and leaves lone stations on the right', async () => {
    const { ladosPastilla } = await import('./capa-estaciones-rio')
    const lados = ladosPastilla([
      { estacionId: 'a', lat: -29.0, lon: -56.6 },
      { estacionId: 'b', lat: -29.05, lon: -56.5 },
      { estacionId: 'c', lat: -27.0, lon: -58.0 },
    ])
    expect(lados.get('a')).toBe('izquierda')
    expect(lados.get('b')).toBe('derecha')
    expect(lados.get('c')).toBe('derecha')
  })
})
