// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { VeredictoModal, type EventoTerreno } from './veredicto-modal'
import type { DtoVeredicto } from '@/lib/infraestructura/veredicto/dto'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function fechaLocal(offsetDias: number) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDias)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function ddMm(fecha: string) {
  const [, m, d] = fecha.split('-')
  return `${d}/${m}`
}

function veredicto(overrides: Partial<DtoVeredicto>): DtoVeredicto {
  return {
    id: 'v-1',
    fecha: fechaLocal(0),
    ambito: 'provincia',
    tipoDia: 'hoy',
    nivel: 'sin_senal',
    texto: 'Texto de prueba.',
    fuente: 'ia',
    enCalibracion: false,
    cerrado: false,
    generadoEn: '2026-10-13T12:30:00.000Z',
    version: 1,
    frases: null,
    traza: [],
    metricas: [],
    fuentesAusentes: [],
    aguasArriba: [],
    imergHasta: null,
    ...overrides,
  }
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function evento(overrides: Partial<EventoTerreno>): EventoTerreno {
  return {
    id: 'EV-1',
    fecha: hoy,
    fechaTexto: ddMm(hoy),
    departamento: 'PASO DE LOS LIBRES',
    lugar: 'Centro',
    titulo: 'Evento',
    tipo: 'Evento reportado',
    confianza: 'alta',
    confianzaTexto: 'Confianza alta',
    fuente: { medio: 'Medio', fecha: '13/10/2026', url: 'https://example.com/nota' },
    ...overrides,
  }
}

function mockFetchVeredictos(veredictos: DtoVeredicto[]) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.includes('/eventos')) return jsonResponse({ eventos: [] }, 200)
    return jsonResponse({ veredictos }, 200)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const depto = (id: string, ambito: string, nivel: string, texto: string, extra: Partial<DtoVeredicto> = {}) =>
  veredicto({ id, fecha: hoy, ambito: `departamento:${ambito}`, nivel, texto, ...extra })

const ayer = fechaLocal(-1)
const hoy = fechaLocal(0)
const manana = fechaLocal(1)

describe('VeredictoModal', () => {
  it('shows loading, then the timeline and today by default with the AI headline', async () => {
    const fetchMock = mockFetchVeredictos([
      veredicto({ id: 'a', fecha: ayer, tipoDia: 'observado', nivel: 'alerta', texto: 'Ayer texto.' }),
      veredicto({ id: 'b', fecha: hoy, nivel: 'vigilancia', texto: 'Hoy texto.', enCalibracion: true }),
      veredicto({ id: 'c', fecha: manana, tipoDia: 'pronostico', nivel: 'sin_senal', texto: 'Mañana texto.' }),
    ])

    render(<VeredictoModal open onOpenChange={() => {}} />)

    expect(screen.getByText('Cargando veredictos…')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/infraestructura/veredictos', expect.anything())

    const detalle = await screen.findByRole('region', { name: 'Veredicto del día' })
    const linea = screen.getByRole('group', { name: 'Línea de tiempo' })
    expect(within(linea).getAllByRole('button')).toHaveLength(3)
    expect(within(detalle).getByRole('heading', { name: 'Hoy' })).toBeInTheDocument()
    expect(within(detalle).getByText('Generado con IA · puede contener errores')).toBeInTheDocument()
    expect(within(detalle).getByText('Hoy texto.')).toBeInTheDocument()
    expect(within(detalle).getByLabelText('Nivel: Vigilancia')).toBeInTheDocument()
    expect(within(detalle).getByText('En calibración')).toBeInTheDocument()
  })

  it('always opens on the current day, even when its verdict is missing and a stale row says hoy', async () => {
    mockFetchVeredictos([
      veredicto({ id: 'a', fecha: ayer, tipoDia: 'hoy', nivel: 'alerta', texto: 'Ayer texto.' }),
    ])

    render(<VeredictoModal open onOpenChange={() => {}} />)
    const linea = await screen.findByRole('group', { name: 'Línea de tiempo' })
    expect(within(linea).getByRole('button', { name: new RegExp(ddMm(hoy)) })).toHaveAttribute('aria-pressed', 'true')
    const detalle = screen.getByRole('region', { name: 'Veredicto del día' })
    expect(within(detalle).getByRole('heading', { name: 'Hoy' })).toBeInTheDocument()
    expect(within(detalle).getByText('El veredicto de este día todavía no se generó.')).toBeInTheDocument()
  })

  it('switches the day from the timeline', async () => {
    mockFetchVeredictos([
      veredicto({ id: 'a', fecha: ayer, tipoDia: 'observado', nivel: 'alerta', texto: 'Ayer texto.' }),
      veredicto({ id: 'b', fecha: hoy, nivel: 'vigilancia', texto: 'Hoy texto.' }),
    ])

    render(<VeredictoModal open onOpenChange={() => {}} />)
    const linea = await screen.findByRole('group', { name: 'Línea de tiempo' })
    fireEvent.click(within(linea).getByRole('button', { name: new RegExp(ddMm(ayer)) }))

    const detalle = screen.getByRole('region', { name: 'Veredicto del día' })
    expect(within(detalle).getByText('Ayer texto.')).toBeInTheDocument()
    expect(within(detalle).getByText(/observado/)).toBeInTheDocument()
  })

  it('lists departments from most to least severe, then by schools without classes', async () => {
    mockFetchVeredictos([
      veredicto({ id: 'p', fecha: hoy, nivel: 'severo', texto: 'Titular.' }),
      depto('d1', 'GOYA', 'vigilancia', 'Goya en vigilancia.'),
      depto('d2', 'LAVALLE', 'alerta', 'Lavalle en alerta.'),
      depto('d3', 'ESQUINA', 'severo', 'Esquina severo.'),
      depto('d4', 'SAUCE', 'alerta', 'Sauce con escuelas.', {
        metricas: [{ id: 'escuelas.sin_clases', valor: 3, unidad: 'escuelas', etiqueta: 'x', fuenteUrl: null }],
      }),
    ])

    render(<VeredictoModal open onOpenChange={() => {}} />)
    const lista = await screen.findByRole('list', { name: 'Departamentos' })
    const nombres = within(lista).getAllByRole('listitem').map((li) => li.querySelector('strong')?.textContent)
    expect(nombres).toEqual(['Esquina', 'Sauce', 'Lavalle', 'Goya'])
  })

  it('collapses departments without news into one line', async () => {
    mockFetchVeredictos([
      veredicto({ id: 'p', fecha: hoy, nivel: 'alerta' }),
      depto('d1', 'GOYA', 'alerta', 'Goya en alerta.'),
    ])

    render(<VeredictoModal open onOpenChange={() => {}} />)
    const quietos = await screen.findByText(/^Sin novedades:/)
    expect(quietos).toHaveTextContent('Bella Vista')
    expect(quietos).not.toHaveTextContent('Goya')
  })

  it('shows only the first sentence of an old long department text', async () => {
    mockFetchVeredictos([
      veredicto({ id: 'p', fecha: hoy, nivel: 'alerta' }),
      depto('d', 'PASO DE LOS LIBRES', 'alerta', 'Se reportaron cortes. Otra oración.'),
    ])
    const onSeleccionarDepartamento = vi.fn()

    render(<VeredictoModal open onOpenChange={() => {}} onSeleccionarDepartamento={onSeleccionarDepartamento} />)
    const lista = await screen.findByRole('list', { name: 'Departamentos' })
    expect(within(lista).getByText('Paso de los Libres')).toBeInTheDocument()
    expect(within(lista).getByText('Se reportaron cortes.')).toBeInTheDocument()
    expect(within(lista).queryByText(/Otra oración/)).toBeNull()

    fireEvent.click(within(lista).getByRole('button', { name: 'Ver Paso de los Libres en el mapa' }))
    expect(onSeleccionarDepartamento).toHaveBeenCalledWith('PASO DE LOS LIBRES')
  })

  it('shows one headline only for an old verdict with many sentences', async () => {
    const frases = Array.from({ length: 6 }, (_, i) => ({ texto: `Frase ${i}.`, refs: [] }))
    mockFetchVeredictos([veredicto({ id: 'largo', fecha: hoy, frases })])

    render(<VeredictoModal open onOpenChange={() => {}} />)
    const detalle = await screen.findByRole('region', { name: 'Veredicto del día' })
    expect(within(detalle).getByText('Frase 0.')).toHaveClass('sr-only')
    expect(within(detalle).queryByText('Frase 1.')).toBeNull()
  })

  it('hides technical details: metrics, rules, upstream stations and sources', async () => {
    mockFetchVeredictos([
      veredicto({
        id: 'p',
        fecha: hoy,
        nivel: 'alerta',
        imergHasta: new Date().toISOString(),
        fuentesAusentes: ['smn'],
        metricas: [{ id: 'rio.x.altura_max_m', valor: 7.25, unidad: 'm', etiqueta: 'Altura máxima X', fuenteUrl: 'https://f' }],
        traza: [{ regla: 'rio.estado', ref: 'rio.x.estado_max', valor: 7.25, umbral: 'alerta', nivel: 'alerta' }],
        aguasArriba: [{ estacionId: 'pna-iguazu', nombre: 'IGUAZU', rio: 'parana', estadoMax: 'normal', alturaMaxM: 30.8, umbralM: 31.5 }],
      }),
    ])

    render(<VeredictoModal open onOpenChange={() => {}} />)
    const detalle = await screen.findByRole('region', { name: 'Veredicto del día' })
    expect(detalle.querySelector('details')).toBeNull()
    expect(within(detalle).queryByText(/Aguas arriba/)).toBeNull()
    expect(within(detalle).queryByText(/Altura máxima/)).toBeNull()
    expect(within(detalle).queryByRole('link')).toBeNull()
  })

  it('without AI shows the rules label instead of the AI mark', async () => {
    mockFetchVeredictos([veredicto({ id: 'p', fecha: hoy, fuente: 'plantilla' })])

    render(<VeredictoModal open onOpenChange={() => {}} />)
    const detalle = await screen.findByRole('region', { name: 'Veredicto del día' })
    expect(within(detalle).getByText('Generado por reglas automáticas')).toBeInTheDocument()
    expect(within(detalle).queryByText(/Generado con IA/)).toBeNull()
  })

  it('lists the confirmed field events of the selected day only', async () => {
    mockFetchVeredictos([
      veredicto({ id: 'a', fecha: ayer, tipoDia: 'observado' }),
      veredicto({ id: 'b', fecha: hoy }),
    ])
    const eventos: EventoTerreno[] = [
      evento({
        id: 'e1',
        fecha: hoy,
        titulo: 'Torre caída en ruta 14',
        lugar: 'Ruta 14',
        fuente: { medio: 'Diario X', fecha: '13/10/2026', url: 'https://example.com/nota' },
      }),
      evento({ id: 'e2', fecha: ayer, titulo: 'Otro evento', departamento: 'CONCORDIA' }),
    ]

    render(<VeredictoModal open onOpenChange={() => {}} eventos={eventos} />)
    const seccion = await screen.findByRole('region', { name: 'Confirmado en terreno' })
    expect(within(seccion).getByText('Torre caída en ruta 14')).toBeInTheDocument()
    expect(within(seccion).getByRole('link', { name: 'Diario X, 13/10/2026' })).toHaveAttribute('href', 'https://example.com/nota')
    expect(within(seccion).queryByText('Otro evento')).not.toBeInTheDocument()

    fireEvent.click(within(screen.getByRole('group', { name: 'Línea de tiempo' })).getByRole('button', { name: new RegExp(ddMm(ayer)) }))
    expect(screen.getByRole('region', { name: 'Confirmado en terreno' })).toHaveTextContent('Otro evento')
  })

  it('loads events from the API for the verdict range and hides the section when there are none', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/eventos')) return jsonResponse({ eventos: [evento({ id: 'api', fecha: hoy, titulo: 'Evento desde API' })] }, 200)
      return jsonResponse({ veredictos: [veredicto({ id: 'a', fecha: ayer, tipoDia: 'observado' }), veredicto({ id: 'b', fecha: hoy })] }, 200)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<VeredictoModal open onOpenChange={() => {}} />)
    expect(await screen.findByText('Evento desde API')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(`/api/infraestructura/veredictos/eventos?desde=${ayer}&hasta=${hoy}`, expect.anything())

    fireEvent.click(within(screen.getByRole('group', { name: 'Línea de tiempo' })).getByRole('button', { name: new RegExp(ddMm(ayer)) }))
    expect(screen.queryByRole('region', { name: 'Confirmado en terreno' })).toBeNull()
  })

  it('shows the error message when loading fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'boom' }, 500)))

    render(<VeredictoModal open onOpenChange={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText('No se pudieron cargar los veredictos.')).toBeInTheDocument()
    })
  })

  it('shows the empty state when there are no verdicts', async () => {
    mockFetchVeredictos([])

    render(<VeredictoModal open onOpenChange={() => {}} />)
    expect(await screen.findByText('Sin veredictos todavía para este período.')).toBeInTheDocument()
  })
})
