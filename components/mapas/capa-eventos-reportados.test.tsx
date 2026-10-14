// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { CapaEventosReportados } from './capa-eventos-reportados'
import { registrarInsignias } from '@/lib/mapas/insignias-mapa'

const { mapa } = vi.hoisted(() => {
  const manejadores = new Map<string, Array<(evento: unknown) => void>>()
  const mapa = {
    getMap: () => ({}),
    getCanvas: () => ({ style: { cursor: '' } }),
    on: (tipo: string, capa: string, fn: (evento: unknown) => void) => {
      const clave = `${tipo}:${capa}`
      manejadores.set(clave, [...(manejadores.get(clave) ?? []), fn])
    },
    off: (tipo: string, capa: string, fn: (evento: unknown) => void) => {
      const clave = `${tipo}:${capa}`
      manejadores.set(clave, (manejadores.get(clave) ?? []).filter((f) => f !== fn))
    },
    emitir: (tipo: string, capa: string, evento: unknown) => {
      for (const fn of manejadores.get(`${tipo}:${capa}`) ?? []) fn(evento)
    },
  }
  return { mapa }
})

vi.mock('react-map-gl/maplibre', () => ({
  Source: ({ id, data, attribution, children }: { id: string; data: unknown; attribution?: string; children: React.ReactNode }) => (
    <div data-testid="source" data-props={JSON.stringify({ id, data, attribution })}>
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

const extra = vi.hoisted(() => ({
  sinUbicacionPrecisa: [] as Array<{
    id: string
    lugar: string
    titulo: string
    confianza: unknown
    confianzaEtiqueta: string
    medio: string | null
    fecha: string | null
  }>,
}))

vi.mock('@/lib/mapas/eventos-inundaciones', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/mapas/eventos-inundaciones')>()
  return {
    ...real,
    ubicarEventos: (entrada: Parameters<typeof real.ubicarEventos>[0]) => {
      const resultado = real.ubicarEventos(entrada)
      return { ...resultado, sinUbicacionPrecisa: [...resultado.sinUbicacionPrecisa, ...extra.sinUbicacionPrecisa] }
    },
  }
})

const EVENTOS = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: null,
      properties: {
        id_evento: 'EV-1',
        tipo_fenomeno: 'Inundación',
        tipo_afectacion: 'Evacuados',
        localidad: 'Bonpland',
        departamento: 'Ituzaingó',
        fuente_principal: 'EVD-048',
        evidencias: 'EVD-002',
        inicio_evento: '2026-10-01',
        ultima_actualizacion: '2026-10-10',
        estado_temporal: 'activo',
        confianza: 'alta',
        mediciones: 'Cota 4,2 m',
      },
    },
    {
      type: 'Feature',
      geometry: null,
      properties: {
        id_evento: 'EV-2',
        tipo_fenomeno: 'Inundación',
        tipo_afectacion: 'Cortes de ruta',
        localidad: 'Bonpland',
        departamento: 'Ituzaingó',
        fuente_principal: 'EVD-048',
        inicio_evento: '2026-10-03',
        ultima_actualizacion: '2026-10-04',
        estado_temporal: 'cerrado',
        confianza: 'media',
        mediciones: '',
      },
    },
    {
      type: 'Feature',
      geometry: null,
      properties: {
        id_evento: 'EV-3',
        tipo_fenomeno: 'Inundación',
        tipo_afectacion: 'Daños',
        localidad: 'Paso de los Libres',
        departamento: 'Paso de los Libres',
        fuente_principal: 'EVD-002',
        inicio_evento: '2026-10-02',
        ultima_actualizacion: '2026-10-05',
        estado_temporal: 'activo',
        confianza: 'baja',
        mediciones: '',
      },
    },
  ],
}

const CSV = [
  'id_evidencia,fuente,titulo,url,fecha_publicacion',
  'EVD-048,Diario Local,"Crecida y cortes",https://example.test/nota,2026-10-01',
  'EVD-002,Prefectura,Altura de los ríos,https://example.test/alturas,2026-10-02',
].join('\n')

const RESPUESTAS: Record<string, unknown> = {
  '/data/eventos-inundaciones/eventos.geojson': EVENTOS,
  '/data/localizaciones.json': [],
  '/data/eventos-inundaciones/gazetteer-osm.json': { lugares: [], sinCoincidencia: [] },
  '/data/localities.geojson': {
    features: [{ properties: { name: 'Bonpland' }, geometry: { type: 'Point', coordinates: [-58.1, -28.4] } }],
  },
  '/data/departamentos-corrientes-georef-2026-09-27.geojson': {
    features: [{ properties: { nombre: 'Paso de los Libres', centroide: { lon: -57.1, lat: -29.7 } } }],
  },
}

function mockFetch() {
  global.fetch = vi.fn(async (url: string) => {
    if (url === '/data/eventos-inundaciones/evidencias.csv') {
      return { ok: true, text: async () => CSV, json: async () => ({}) }
    }
    return { ok: true, json: async () => RESPUESTAS[url], text: async () => '' }
  }) as unknown as typeof fetch
}

type Feature = {
  geometry: { coordinates: [number, number] }
  properties: { indice: number; confianza: string; insignia: string; desplazamiento: [number, number]; lugar: string }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- props serializadas del mock, se leen como JSON libre
function propsDe(testId: string): Record<string, any> {
  return JSON.parse(screen.getByTestId(testId).getAttribute('data-props') ?? '{}')
}

async function fuenteCargada(): Promise<{ id: string; attribution: string; data: { features: Feature[] } }> {
  await screen.findByTestId('source')
  await waitFor(() => expect(propsDe('source').data.features).toHaveLength(3))
  return propsDe('source') as { id: string; attribution: string; data: { features: Feature[] } }
}

function indiceDe(features: Feature[], confianza: string): number {
  return features.find((f) => f.properties.confianza === confianza)!.properties.indice
}

describe('CapaEventosReportados', () => {
  beforeEach(() => {
    mockFetch()
    vi.mocked(registrarInsignias).mockResolvedValue(undefined)
  })

  afterEach(() => {
    cleanup()
    extra.sinUbicacionPrecisa = []
    vi.restoreAllMocks()
  })

  it('publica una feature por evento ubicado con la insignia de su confianza', async () => {
    render(<CapaEventosReportados visible />)

    const fuente = await fuenteCargada()
    expect(fuente.id).toBe('eventos-reportados-src')
    expect(fuente.data.features.map((f) => f.properties.insignia).sort()).toEqual(['evento-alta', 'evento-baja', 'evento-media'])
    expect(registrarInsignias).toHaveBeenCalledWith(expect.anything(), ['evento-alta', 'evento-media', 'evento-baja'])
  })

  it('desplaza los eventos co-ubicados con desplazamientos distintos y no nulos', async () => {
    render(<CapaEventosReportados visible />)

    const { data } = await fuenteCargada()
    const alta = data.features.find((f) => f.properties.confianza === 'alta')!
    const media = data.features.find((f) => f.properties.confianza === 'media')!
    const baja = data.features.find((f) => f.properties.confianza === 'baja')!
    expect(alta.geometry.coordinates).toEqual(media.geometry.coordinates)
    expect(alta.properties.desplazamiento).not.toEqual([0, 0])
    expect(media.properties.desplazamiento).not.toEqual([0, 0])
    expect(alta.properties.desplazamiento).not.toEqual(media.properties.desplazamiento)
    expect(baja.properties.desplazamiento).toEqual([0, 0])
  })

  it('atribuye OpenStreetMap en la fuente', async () => {
    render(<CapaEventosReportados visible />)

    const fuente = await fuenteCargada()
    expect(fuente.attribution).toBe('Ubicaciones © OpenStreetMap contributors')
  })

  it('crea la capa de símbolos antes de beforeId y no permite solapamiento de insignias', async () => {
    render(<CapaEventosReportados visible beforeId="etiquetas-mapa" />)

    await fuenteCargada()
    const capa = propsDe('layer')
    expect(capa.id).toBe('eventos-reportados-simbolos')
    expect(capa.beforeId).toBe('etiquetas-mapa')
    expect(capa.layout['icon-allow-overlap']).toBe(false)
    expect(capa.layout['icon-image']).toEqual(['get', 'insignia'])
  })

  it('al hacer clic en un evento abre el popup con su fuente y confianza', async () => {
    render(<CapaEventosReportados visible />)

    const fuente = await fuenteCargada()
    const indice = indiceDe(fuente.data.features, 'alta')
    act(() => mapa.emitir('click', 'eventos-reportados-simbolos', { features: [{ properties: { indice } }] }))

    const popup = await waitFor(() => screen.getByTestId('popup'))
    expect(within(popup).getByText('Confianza alta')).toBeTruthy()
    expect(within(popup).getByRole('link', { name: 'Diario Local, 1/10' }).getAttribute('href')).toBe('https://example.test/nota')
  })

  it('al pasar el cursor muestra un tooltip de una línea con título, lugar y pista de clic', async () => {
    render(<CapaEventosReportados visible />)

    const fuente = await fuenteCargada()
    const indice = indiceDe(fuente.data.features, 'baja')
    act(() => mapa.emitir('mouseenter', 'eventos-reportados-simbolos', { features: [{ properties: { indice } }] }))

    const tooltip = await waitFor(() => screen.getByTestId('tooltip'))
    expect(tooltip.textContent ?? '').toMatch(/^.+ · .+ — clic para ver detalle$/)
    expect(tooltip.textContent ?? '').toContain(' · ')
    act(() => mapa.emitir('mouseleave', 'eventos-reportados-simbolos', {}))
    await waitFor(() => expect(screen.queryByTestId('tooltip')).toBeNull())
  })

  it('informa el resumen provincial y el total de eventos dibujados tras cargar', async () => {
    const onResumen = vi.fn()
    render(<CapaEventosReportados visible onResumen={onResumen} />)

    await waitFor(() => expect(onResumen).toHaveBeenCalled())
    const resumen = onResumen.mock.calls[0][0]
    expect(resumen.total).toBe(3)
    expect(Array.isArray(resumen.resumenProvincial)).toBe(true)
    expect(Array.isArray(resumen.sinUbicacionPrecisa)).toBe(true)
  })

  it('no renderiza nada cuando la capa está oculta', () => {
    const { container } = render(<CapaEventosReportados visible={false} />)

    expect(container.innerHTML).toBe('')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('no rompe la capa si alguna carga falla', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('red caída')) as unknown as typeof fetch
    render(<CapaEventosReportados visible />)

    await screen.findByTestId('source')
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(propsDe('source').data.features).toHaveLength(0)
    expect(screen.queryByTestId('popup')).toBeNull()
  })

  it('informa los eventos ordenados por fecha descendente', async () => {
    const onResumen = vi.fn()
    render(<CapaEventosReportados visible onResumen={onResumen} />)

    await waitFor(() => expect(onResumen).toHaveBeenCalled())
    const eventos = onResumen.mock.calls[0][0].eventos as Array<{ id: string; noDeterminada: boolean }>
    expect(eventos.map((e) => e.id)).toEqual(['EV-2', 'EV-3', 'EV-1'])
    expect(eventos.every((e) => e.noDeterminada === false)).toBe(true)
  })

  it('incluye como noDeterminada el evento sin ubicación precisa que no tiene feature dibujada', async () => {
    extra.sinUbicacionPrecisa = [
      { id: 'EV-9', lugar: 'Lugar lejano', titulo: 'Crecida del río sin ubicación', confianza: 'media', confianzaEtiqueta: 'Confianza media', medio: 'Diario', fecha: '2026-10-04' },
    ]
    const onResumen = vi.fn()
    render(<CapaEventosReportados visible onResumen={onResumen} />)

    await waitFor(() => expect(onResumen).toHaveBeenCalled())
    const eventos = onResumen.mock.calls[0][0].eventos as Array<Record<string, unknown>>
    const sinPunto = eventos.find((e) => e.id === 'EV-9')
    expect(sinPunto).toMatchObject({
      titulo: 'Crecida del río sin ubicación',
      lugar: 'Lugar lejano',
      confianza: 'media',
      medio: 'Diario',
      noDeterminada: true,
      lon: null,
      lat: null,
      fecha: '2026-10-04',
    })
    expect(eventos.filter((e) => e.noDeterminada === true)).toHaveLength(1)
    expect(onResumen.mock.calls[0][0].total).toBe(3)
  })

  it('abre el popup del evento indicado por seleccionadoId al cambiar la prop', async () => {
    const onResumen = vi.fn()
    const { rerender } = render(<CapaEventosReportados visible onResumen={onResumen} />)

    await fuenteCargada()
    const titulo = (onResumen.mock.calls[0][0].eventos as Array<{ id: string; titulo: string }>).find((e) => e.id === 'EV-1')!.titulo
    expect(screen.queryByTestId('popup')).toBeNull()

    rerender(<CapaEventosReportados visible onResumen={onResumen} seleccionadoId="EV-1" />)
    const popup = await waitFor(() => screen.getByTestId('popup'))
    expect(within(popup).getByText(titulo)).toBeTruthy()
  })

  it('aplica el realce de resaltadoId en el tamaño del icono de la capa', async () => {
    render(<CapaEventosReportados visible resaltadoId="EV-2" />)

    await fuenteCargada()
    expect(propsDe('layer').layout['icon-size']).toEqual(['case', ['==', ['get', 'id_evento'], 'EV-2'], 1.35, 1])
  })

  it('informa onSeleccion con el id del evento al hacer clic en su marcador', async () => {
    const onSeleccion = vi.fn()
    render(<CapaEventosReportados visible onSeleccion={onSeleccion} />)

    const fuente = await fuenteCargada()
    const indice = indiceDe(fuente.data.features, 'media')
    act(() => mapa.emitir('click', 'eventos-reportados-simbolos', { features: [{ properties: { indice } }] }))

    expect(onSeleccion).toHaveBeenCalledWith('EV-2')
  })
})
