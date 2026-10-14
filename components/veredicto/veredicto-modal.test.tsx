// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { VeredictoModal, type EventoTerreno } from './veredicto-modal'
import type { DtoVeredicto } from '@/lib/infraestructura/veredicto/dto'

afterEach(() => {
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
    ...overrides,
  }
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function mockFetchVeredictos(veredictos: DtoVeredicto[]) {
  const fetchMock = vi.fn(async () => jsonResponse({ veredictos }, 200))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
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
      {
        id: 'e1',
        fecha: hoy,
        departamento: 'PASO DE LOS LIBRES',
        descripcion: 'Torre caída en ruta 14.',
        confianza: 'alta',
        fuenteUrl: 'https://example.com/nota',
      },
      { id: 'e2', fecha: ayer, departamento: 'CONCORDIA', descripcion: 'Otro evento.', confianza: 'baja' },
    ]

    render(<VeredictoModal open onOpenChange={() => {}} eventos={eventos} />)
    const seccion = await screen.findByRole('region', { name: 'Confirmado en terreno (no modifica el nivel)' })
    expect(within(seccion).getByText('Torre caída en ruta 14.')).toBeInTheDocument()
    expect(within(seccion).getByText('confianza alta')).toBeInTheDocument()
    expect(within(seccion).getByRole('link', { name: 'fuente' })).toHaveAttribute('href', 'https://example.com/nota')
    expect(within(seccion).queryByText('Otro evento.')).not.toBeInTheDocument()

    fireEvent.click(within(screen.getByRole('group', { name: 'Línea de tiempo' })).getByRole('button', { name: new RegExp(ddMm(ayer)) }))
    expect(within(seccion).getByText('Otro evento.')).toBeInTheDocument()
    expect(within(seccion).queryByText('Torre caída en ruta 14.')).not.toBeInTheDocument()
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
})
