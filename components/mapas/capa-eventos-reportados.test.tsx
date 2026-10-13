// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { CapaEventosReportados } from './capa-eventos-reportados'

vi.mock('react-map-gl/maplibre', () => ({
  Marker: ({ children, offset }: { children: React.ReactNode; offset?: unknown }) => (
    <div data-testid="marker" data-offset={JSON.stringify(offset ?? null)}>{children}</div>
  ),
  Popup: ({ children }: { children: React.ReactNode }) => <div data-testid="popup">{children}</div>,
}))

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

describe('CapaEventosReportados', () => {
  beforeEach(() => mockFetch())

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('muestra un marcador accesible por evento ubicado', async () => {
    render(<CapaEventosReportados visible />)

    expect(await screen.findByRole('button', { name: 'Evento Evacuados en Bonpland' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Evento Cortes de ruta en Bonpland' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Evento Daños en Paso de los Libres' })).toBeTruthy()
  })

  it('desplaza los marcadores que comparten coordenadas para que todos sean clicables', async () => {
    const { container } = render(<CapaEventosReportados visible />)
    await screen.findByRole('button', { name: 'Evento Evacuados en Bonpland' })

    // EV-1 and EV-2 both resolve to Bonpland; EV-3 is elsewhere and keeps no offset.
    const marcadores = Array.from(container.querySelectorAll('[data-testid="marker"]')).map((m) => m.getAttribute('data-offset'))
    expect(marcadores[0]).not.toBe(marcadores[1])
    expect(marcadores[2]).toBe(JSON.stringify([0, 0]))
  })

  it('marca con borde punteado los eventos ubicados sólo a nivel de departamento', async () => {
    render(<CapaEventosReportados visible />)

    const departamento = await screen.findByRole('button', { name: 'Evento Daños en Paso de los Libres' })
    expect(departamento.style.border).toContain('dashed')
    const localidad = screen.getByRole('button', { name: 'Evento Evacuados en Bonpland' })
    expect(localidad.style.border).toContain('solid')
  })

  it('muestra el popup del evento seleccionado con fuente, fechas y estado', async () => {
    render(<CapaEventosReportados visible />)

    fireEvent.click(await screen.findByRole('button', { name: 'Evento Evacuados en Bonpland' }))

    const popup = await waitFor(() => screen.getByTestId('popup'))
    expect(within(popup).getByText('Inundación — Evacuados')).toBeTruthy()
    expect(within(popup).getByText('Lugar: Bonpland (Ituzaingó)')).toBeTruthy()
    expect(within(popup).getByText('Ubicación aproximada a nivel de localidad')).toBeTruthy()
    expect(within(popup).getByText('Inicio: 2026-10-01')).toBeTruthy()
    expect(within(popup).getByText('Última actualización: 2026-10-10')).toBeTruthy()
    expect(within(popup).getByText('Estado: activo')).toBeTruthy()
    expect(within(popup).getByText('Confianza: alta')).toBeTruthy()
    expect(within(popup).getByText('Cota 4,2 m')).toBeTruthy()
    expect(within(popup).getByText('Registro de eventos reportados (prensa y organismos). No es una medición.')).toBeTruthy()
    const enlace = within(popup).getByRole('link', { name: 'Fuente: Crecida y cortes' })
    expect(enlace.getAttribute('href')).toBe('https://example.test/nota')
    expect(enlace.getAttribute('target')).toBe('_blank')
    expect(enlace.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('no renderiza nada cuando la capa está oculta', () => {
    const { container } = render(<CapaEventosReportados visible={false} />)

    expect(container.innerHTML).toBe('')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('no rompe la capa si alguna carga falla', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('red caída')) as unknown as typeof fetch
    const { container } = render(<CapaEventosReportados visible />)

    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(container.querySelectorAll('button').length).toBe(0)
  })
})
