// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EstadoActualParte } from './estado-actual-parte'
import type { EstadoActualRespuesta } from './estado-actual-textos'

const CUE = '180001000'

const PARTE = {
  id: 'p1',
  cueAnexo: CUE,
  estadoEstablecimiento: 'habitual' as const,
  estadoEstablecimientoRigeDesde: '2026-09-18T13:30:00.000Z',
  actualizadaEn: '2026-09-18T13:35:00.000Z',
}

const CON_SITUACION: EstadoActualRespuesta = {
  ok: true,
  periodo: { id: 'per1', nombre: 'ENOS 2026/2027' },
  parte: PARTE,
  servicio: {
    estadoGeneral: 'parcial',
    alcanceVigente: [
      {
        id: 'sa1',
        parteId: 'p1',
        tipo: 'seccion',
        referenciaId: '11',
        estado: 'suspendido',
        rigeDesde: '2026-09-18T13:30:00.000Z',
        creadaEn: '2026-09-18T13:30:00.000Z',
        retiradaEn: null,
      },
    ],
  },
  afectaciones: [
    {
      id: 'a1',
      motivo: 'Inundación del establecimiento',
      categoria: 'establecimiento',
      severidad: 'Alta',
      descripcion: null,
      rigeDesde: '2026-09-18T13:30:00.000Z',
      creadaEn: '2026-09-18T13:30:00.000Z',
      causadaPorId: null,
      secciones: [],
      totales: { secciones: 3, alumnos: 74 },
    },
    {
      id: 'a2',
      motivo: 'Inaccesibilidad de alumnos',
      categoria: 'alumnos',
      severidad: 'Media',
      impactoAlumnos: { afectados: 12, matricula: 24, porcentaje: 50, prioridad: 'Media', corteId: 1, version: 1 },
      descripcion: null,
      rigeDesde: '2026-09-18T13:30:00.000Z',
      creadaEn: '2026-09-18T13:30:00.000Z',
      causadaPorId: null,
      secciones: [
        {
          geSectionId: 11,
          seccionCompleta: false,
          alumnos: [{ gePersonId: 5, nombre: 'Ana', apellido: 'Gómez' }],
        },
      ],
      totales: { secciones: 1, alumnos: 12 },
    },
  ],
  secciones: [
    { geSectionId: 11, turno: 'Mañana' },
    { geSectionId: 12, turno: 'Tarde' },
  ],
  ultimaActualizacion: '2026-09-18T13:35:00.000Z',
}

const SIN_SITUACION: EstadoActualRespuesta = {
  ok: true,
  periodo: null,
  parte: null,
}

function responderCon(cuerpo: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => cuerpo,
  } as unknown as Response)
}

beforeEach(() => {
  vi.stubGlobal('fetch', responderCon(CON_SITUACION))
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('EstadoActualParte — sin situación en seguimiento (spec §17)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', responderCon(SIN_SITUACION))
  })

  it('states the spec §17 message and offers "Cargar una situación"', async () => {
    render(<EstadoActualParte cue={CUE} />)

    expect(
      await screen.findByText(
        'No hay una situación hidrometeorológica en seguimiento para este establecimiento.',
      ),
    ).toBeVisible()

    const iniciar = screen.getByRole('link', { name: 'Cargar una situación' })
    expect(iniciar).toHaveAttribute('href', `/problematicas/parte/nuevo?cue=${CUE}`)
  })

  it('does not offer "Actualizar el parte" when there is nothing to update', async () => {
    render(<EstadoActualParte cue={CUE} />)
    await screen.findByRole('link', { name: 'Cargar una situación' })

    expect(screen.queryByRole('link', { name: 'Actualizar el parte' })).toBeNull()
  })

  it('does not offer the history when the school never opened a parte', async () => {
    render(<EstadoActualParte cue={CUE} />)
    await screen.findByRole('link', { name: 'Cargar una situación' })

    expect(screen.queryByRole('button', { name: 'Ver historial' })).toBeNull()
  })

  it('treats an opened parte with no vigente afectación as "sin situación"', async () => {
    vi.stubGlobal(
      'fetch',
      responderCon({
        ok: true,
        periodo: { id: 'per1', nombre: 'ENOS 2026/2027' },
        parte: PARTE,
        servicio: { estadoGeneral: 'normal', alcanceVigente: [] },
        afectaciones: [],
        secciones: [],
        ultimaActualizacion: PARTE.actualizadaEn,
      }),
    )
    render(<EstadoActualParte cue={CUE} />)

    expect(await screen.findByRole('link', { name: 'Cargar una situación' })).toBeVisible()
    // El servicio y el establecimiento sí existen: se siguen mostrando.
    expect(screen.getByText('Funcionamiento habitual')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Funcionamiento' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Edificio' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'En seguimiento' })).toBeVisible()
    expect(screen.getByText('Sin daños / en uso normal')).toBeVisible()
    // Y la última actualización sigue siendo el ancla temporal del parte.
    expect(screen.getByText('Última actualización: 18 de septiembre, 10:35')).toBeVisible()
    // Con la situación solucionada, el historial del parte sigue a mano.
    fireEvent.click(screen.getByRole('button', { name: 'Ver historial' }))
    expect(screen.getByRole('dialog', { name: 'Historial' })).toBeInTheDocument()
  })
})

describe('EstadoActualParte — con situación en seguimiento (spec §6)', () => {
  it('renders both afectaciones with their own severity and scope', async () => {
    render(<EstadoActualParte cue={CUE} />)

    expect(await screen.findByText('Inundación del establecimiento')).toBeVisible()
    expect(screen.getByText('Inaccesibilidad de alumnos')).toBeVisible()

    // Severidad propia por afectación (spec §9), escrita — nunca sólo color.
    expect(screen.getByText('Gravedad Alta')).toBeVisible()
    expect(screen.getByText('12 de 24 alumnos · 50% · Prioridad Media')).toBeVisible()

    // Alcance resumido en el formato de spec §6.
    expect(screen.getByText('3 secciones · 74 alumnos')).toBeVisible()
    expect(screen.getByText('1 sección · 12 alumnos')).toBeVisible()
  })

  it('keeps the update screen to one primary action and one history action', async () => {
    render(<EstadoActualParte cue={CUE} />)
    await screen.findByText('Inundación del establecimiento')
    expect(screen.getAllByRole('link', { name: 'Actualizar el parte' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Ver historial' })).toHaveLength(1)
    expect(screen.queryByRole('link', { name: /Informar un cambio/ })).toBeNull()
  })

  it('shows the derived "parcial" service state with the spec §3.4 wording', async () => {
    render(<EstadoActualParte cue={CUE} />)

    expect(await screen.findByText('Funcionamiento parcialmente interrumpido')).toBeVisible()
  })

  it('shows the last update and both available actions', async () => {
    render(<EstadoActualParte cue={CUE} />)

    expect(await screen.findByText('Última actualización: 18 de septiembre, 10:35')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Actualizar el parte' })).toHaveAttribute(
      'href',
      `/problematicas/parte/actualizar?cue=${CUE}`,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Ver historial' }))
    expect(screen.getByRole('dialog', { name: 'Historial' })).toBeInTheDocument()
  })

  it('never offers the director a way to close or resolve the situation (spec §18.9)', async () => {
    render(<EstadoActualParte cue={CUE} />)
    await screen.findByText('Inundación del establecimiento')

    const textoPantalla = document.body.textContent ?? ''
    expect(textoPantalla).not.toMatch(/resuelt|resolver|cerrar/i)
  })

  it('never uses the banned technical vocabulary (spec §5.4)', async () => {
    render(<EstadoActualParte cue={CUE} />)
    await screen.findByText('Inundación del establecimiento')

    const textoPantalla = document.body.textContent ?? ''
    expect(textoPantalla).not.toMatch(/versión|entidad|registro histórico|persistencia/i)
  })

  it('keeps the student names behind a disclosure instead of hover', async () => {
    const user = userEvent.setup()
    render(<EstadoActualParte cue={CUE} />)

    const resumen = await screen.findByText('Ver alumnos alcanzados')
    expect(screen.queryByText('Gómez, Ana')).not.toBeVisible()

    await user.click(resumen)
    expect(screen.getByText('Gómez, Ana')).toBeVisible()
  })
})

describe('EstadoActualParte — estados de red', () => {
  it('announces the wait instead of leaving the screen blank', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    render(<EstadoActualParte cue={CUE} />)

    expect(screen.getByRole('status')).toHaveTextContent(
      'Buscando el estado actual del establecimiento…',
    )
  })

  it('explains a failed read and offers to try again', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'))
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<EstadoActualParte cue={CUE} />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos mostrar el estado actual del establecimiento. Intente nuevamente.',
    )

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => CON_SITUACION,
    } as unknown as Response)
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))

    await waitFor(() => expect(screen.getByText('Inundación del establecimiento')).toBeVisible())
  })

  it('tells the director their access expired, without a pointless retry', async () => {
    vi.stubGlobal('fetch', responderCon({ error: 'No autorizado' }, 401))
    render(<EstadoActualParte cue={CUE} />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Su acceso ya no está vigente. Vuelva a ingresar la contraseña para ver el estado actual.',
    )
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull()
  })

  it('reuses the existing wording when there is no corte vigente', async () => {
    vi.stubGlobal('fetch', responderCon({ error: 'No hay un corte vigente' }, 503))
    render(<EstadoActualParte cue={CUE} />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No hay datos de escuelas disponibles en este momento. Intente nuevamente más tarde.',
    )
  })
})
