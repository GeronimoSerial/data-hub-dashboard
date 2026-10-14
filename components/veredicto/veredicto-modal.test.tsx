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

function mockFetchVeredictos(veredictos: DtoVeredicto[], puntosRadar: unknown[] = []) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.includes('/radar')) return jsonResponse({ puntos: puntosRadar }, 200)
    return jsonResponse({ veredictos }, 200)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function punto(overrides: { departamento: string | null; horizonteHoras: number; nivelRiesgo: string | null }) {
  return { id: 'p', nombre: 'Escuela', ...overrides }
}

const ayer = fechaLocal(-1)
const hoy = fechaLocal(0)
const manana = fechaLocal(1)

describe('VeredictoModal', () => {
  it('muestra carga, luego la línea de tiempo y el detalle de HOY por defecto', async () => {
    const fetchMock = mockFetchVeredictos([
      veredicto({ id: 'a', fecha: ayer, tipoDia: 'observado', nivel: 'alerta', texto: 'Ayer texto.' }),
      veredicto({ id: 'b', fecha: hoy, nivel: 'vigilancia', texto: 'Hoy texto.', enCalibracion: true }),
      veredicto({ id: 'c', fecha: manana, tipoDia: 'pronostico', nivel: 'sin_senal', texto: 'Mañana texto.' }),
    ])

    render(<VeredictoModal open onOpenChange={() => {}} />)

    expect(screen.getByText('Cargando veredictos…')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/infraestructura/veredictos', expect.anything())

    const detalle = await screen.findByRole('region', { name: 'Detalle del veredicto' })
    const linea = screen.getByRole('group', { name: 'Línea de tiempo' })
    expect(within(linea).getAllByRole('button')).toHaveLength(3)
    expect(within(detalle).getByText(/HOY/)).toBeInTheDocument()
    expect(within(detalle).getByText('Hoy texto.')).toBeInTheDocument()
    expect(within(detalle).getByLabelText('Nivel: Vigilancia')).toBeInTheDocument()
    expect(within(detalle).getByText('En calibración')).toBeInTheDocument()
    expect(within(detalle).getByText(/generado \d{2}:\d{2}/)).toBeInTheDocument()
  })

  it('en HOY muestra hasta qué hora llegó la lluvia IMERG', async () => {
    const hace3h = new Date(Date.now() - 3 * 3600_000).toISOString()
    mockFetchVeredictos([veredicto({ id: 'b', fecha: hoy, imergHasta: hace3h })])

    render(<VeredictoModal open onOpenChange={() => {}} />)
    const detalle = await screen.findByRole('region', { name: 'Detalle del veredicto' })
    expect(within(detalle).getByText(/Lluvia observada hasta \d{2}:\d{2} \(hace 3 h\)/)).toHaveClass(
      'veredicto-detalle__meta',
    )
  })

  it('cambia el detalle al elegir otro día', async () => {
    mockFetchVeredictos([
      veredicto({ id: 'a', fecha: ayer, tipoDia: 'observado', nivel: 'alerta', texto: 'Ayer texto.' }),
      veredicto({ id: 'b', fecha: hoy, nivel: 'vigilancia', texto: 'Hoy texto.' }),
    ])

    render(<VeredictoModal open onOpenChange={() => {}} />)
    const linea = await screen.findByRole('group', { name: 'Línea de tiempo' })
    fireEvent.click(within(linea).getByRole('button', { name: new RegExp(ddMm(ayer)) }))

    const detalle = screen.getByRole('region', { name: 'Detalle del veredicto' })
    expect(within(detalle).getByText('Ayer texto.')).toBeInTheDocument()
    expect(within(detalle).getByText(/OBSERVADO/)).toBeInTheDocument()
  })

  it('llama onSeleccionarDepartamento con el id sin prefijo al pulsar "Ver en el mapa"', async () => {
    mockFetchVeredictos([
      veredicto({ id: 'p', fecha: hoy, nivel: 'vigilancia' }),
      veredicto({
        id: 'd',
        fecha: hoy,
        ambito: 'departamento:PASO DE LOS LIBRES',
        nivel: 'alerta',
        texto: 'Se reportaron cortes. Otra oración.',
      }),
    ])
    const onSeleccionarDepartamento = vi.fn()

    render(
      <VeredictoModal open onOpenChange={() => {}} onSeleccionarDepartamento={onSeleccionarDepartamento} />,
    )
    const seccion = await screen.findByRole('region', { name: 'Departamentos con señal' })
    expect(within(seccion).getByText('Paso de los Libres')).toBeInTheDocument()
    expect(within(seccion).getByText('Se reportaron cortes.')).toBeInTheDocument()

    fireEvent.click(within(seccion).getByRole('button', { name: 'Ver en el mapa' }))
    expect(onSeleccionarDepartamento).toHaveBeenCalledWith('PASO DE LOS LIBRES')
  })

  it('cuenta escuelas por riesgo actual (72 h) por departamento y muestra la nota', async () => {
    mockFetchVeredictos(
      [veredicto({ id: 'd', fecha: hoy, ambito: 'departamento:ITUZAINGÓ', nivel: 'alerta', texto: 'Señal en Ituzaingó.' })],
      [
        punto({ departamento: 'ITUZAINGO', horizonteHoras: 72, nivelRiesgo: 'alto' }),
        punto({ departamento: 'ITUZAINGO', horizonteHoras: 72, nivelRiesgo: 'alto' }),
        punto({ departamento: 'ITUZAINGO', horizonteHoras: 72, nivelRiesgo: 'bajo' }),
        punto({ departamento: 'ITUZAINGO', horizonteHoras: 24, nivelRiesgo: 'alto' }),
      ],
    )

    render(<VeredictoModal open onOpenChange={() => {}} />)
    const seccion = await screen.findByRole('region', { name: 'Departamentos con señal' })
    expect(within(seccion).getByText('Nivel del día según reglas del veredicto: lluvia, ríos y pronóstico por departamento.')).toBeVisible()
    const escuelas = await within(seccion).findByTestId('veredicto-depto-escuelas')
    expect(escuelas).toHaveTextContent('Escuelas por riesgo actual (hoy): 2 alto · 1 bajo')
  })

  it('muestra la nota de generación por reglas cuando la fuente es plantilla', async () => {
    mockFetchVeredictos([veredicto({ id: 'p', fecha: hoy, fuente: 'plantilla' })])

    render(<VeredictoModal open onOpenChange={() => {}} />)
    const detalle = await screen.findByRole('region', { name: 'Detalle del veredicto' })
    expect(within(detalle).getByText('Generado por reglas (IA no disponible)')).toBeInTheDocument()
  })

  it('lista los eventos confirmados del día seleccionado y el mensaje vacío si no hay', async () => {
    mockFetchVeredictos([
      veredicto({ id: 'a', fecha: ayer, tipoDia: 'observado' }),
      veredicto({ id: 'b', fecha: hoy }),
    ])
    const eventos: EventoTerreno[] = [
      evento({
        id: 'e1',
        fecha: hoy,
        fechaTexto: ddMm(hoy),
        titulo: 'Torre caída en ruta 14',
        lugar: 'Ruta 14',
        departamento: 'PASO DE LOS LIBRES',
        confianzaTexto: 'Confianza alta',
        fuente: { medio: 'Diario X', fecha: '13/10/2026', url: 'https://example.com/nota' },
      }),
      evento({ id: 'e2', fecha: ayer, titulo: 'Otro evento', departamento: 'CONCORDIA' }),
    ]

    render(<VeredictoModal open onOpenChange={() => {}} eventos={eventos} />)
    const seccion = await screen.findByRole('region', { name: 'Confirmado en terreno (no modifica el nivel)' })
    expect(within(seccion).getByText('Torre caída en ruta 14')).toBeInTheDocument()
    expect(within(seccion).getByText('Confianza alta')).toBeInTheDocument()
    expect(within(seccion).getByRole('link', { name: 'Diario X, 13/10/2026' })).toHaveAttribute(
      'href',
      'https://example.com/nota',
    )
    expect(within(seccion).queryByText('Otro evento')).not.toBeInTheDocument()

    fireEvent.click(within(screen.getByRole('group', { name: 'Línea de tiempo' })).getByRole('button', { name: new RegExp(ddMm(ayer)) }))
    expect(within(seccion).getByText('Otro evento')).toBeInTheDocument()
    expect(within(seccion).queryByText('Torre caída en ruta 14')).not.toBeInTheDocument()
  })

  it('carga los eventos desde la API con el rango de los veredictos cuando no se pasan por prop', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/eventos')) return jsonResponse({ eventos: [evento({ id: 'api', fecha: hoy, titulo: 'Evento desde API', fechaTexto: ddMm(hoy) })] }, 200)
      return jsonResponse({ veredictos: [veredicto({ id: 'a', fecha: ayer, tipoDia: 'observado' }), veredicto({ id: 'b', fecha: hoy })] }, 200)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<VeredictoModal open onOpenChange={() => {}} />)
    const seccion = await screen.findByRole('region', { name: 'Confirmado en terreno (no modifica el nivel)' })
    expect(await within(seccion).findByText('Evento desde API')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/infraestructura/veredictos/eventos?desde=${ayer}&hasta=${hoy}`,
      expect.anything(),
    )
  })

  it('muestra el mensaje vacío si la API de eventos falla', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/eventos')) return jsonResponse({ error: 'boom' }, 500)
      return jsonResponse({ veredictos: [veredicto({ id: 'b', fecha: hoy })] }, 200)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<VeredictoModal open onOpenChange={() => {}} />)
    const seccion = await screen.findByRole('region', { name: 'Confirmado en terreno (no modifica el nivel)' })
    expect(
      await within(seccion).findByText('Sin eventos confirmados con fuente verificable para este día.'),
    ).toBeInTheDocument()
  })

  it('muestra el mensaje de error si la carga falla', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'boom' }, 500)))

    render(<VeredictoModal open onOpenChange={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText('No se pudieron cargar los veredictos.')).toBeInTheDocument()
    })
  })

  it('muestra el estado vacío cuando no hay veredictos', async () => {
    mockFetchVeredictos([])

    render(<VeredictoModal open onOpenChange={() => {}} />)
    expect(await screen.findByText('Sin veredictos todavía para este período.')).toBeInTheDocument()
  })

  it('describe la traza en lenguaje legible y lista las aguas arriba como contexto', async () => {
    mockFetchVeredictos([
      veredicto({
        id: 'p',
        fecha: hoy,
        nivel: 'alerta',
        metricas: [
          { id: 'rio.pna-paso-de-los-libres.altura_max_m', valor: 7.25, unidad: 'm', etiqueta: 'Altura máxima PASO DE LOS LIBRES', fuenteUrl: 'https://f' },
          { id: 'rio.pna-paso-de-los-libres.alerta_m', valor: 7.1, unidad: 'm', etiqueta: 'Nivel de alerta PASO DE LOS LIBRES', fuenteUrl: 'https://f' },
        ],
        traza: [{ regla: 'rio.estado', ref: 'rio.pna-paso-de-los-libres.estado_max', valor: 7.25, umbral: 'alerta', nivel: 'alerta' }],
        aguasArriba: [
          { estacionId: 'pna-iguazu', nombre: 'IGUAZU', rio: 'parana', estadoMax: 'normal', alturaMaxM: 30.8, umbralM: 31.5 },
        ],
      }),
    ])

    render(<VeredictoModal open onOpenChange={() => {}} />)
    const detalle = await screen.findByRole('region', { name: 'Detalle del veredicto' })
    expect(
      within(detalle).getByText('Prefectura Paso de los Libres (río Uruguay): 7,25 m ≥ alerta 7,10 m'),
    ).toBeInTheDocument()
    expect(within(detalle).getByText('Aguas arriba (contexto, no modifica el nivel)')).toBeInTheDocument()
    expect(
      within(detalle).getByText('Prefectura Iguazú (río Paraná): 30,80 m, por debajo de alerta 31,50 m'),
    ).toBeInTheDocument()
  })
})
