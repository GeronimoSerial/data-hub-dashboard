// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ActualizacionForm } from './actualizacion-form'
import type { MotivoRow } from '@/lib/infraestructura/motivos'

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response
}

const turnos = [
  {
    turno: 'Mañana',
    niveles: [
      {
        nivel: 'Primario',
        secciones: [
          { geSectionId: 10, curso: '1°', division: 'A', nivel: 'Primario', turno: 'Mañana', matricula: 28, alumnos: [] },
          { geSectionId: 11, curso: '1°', division: 'B', nivel: 'Primario', turno: 'Mañana', matricula: 25, alumnos: [] },
        ],
      },
    ],
  },
  {
    turno: 'Tarde',
    niveles: [
      {
        nivel: 'Secundario',
        secciones: [
          { geSectionId: 20, curso: '4°', division: 'A', nivel: 'Secundario', turno: 'Tarde', matricula: 30, alumnos: [] },
        ],
      },
    ],
  },
]

const motivos: MotivoRow[] = [
  { id: 'inundacion', nombre: 'Inundación', categoria: 'establecimiento', orden: 10 },
  { id: 'tormenta-severa', nombre: 'Tormenta severa', categoria: 'establecimiento', orden: 20 },
  { id: 'anegamiento', nombre: 'Anegamiento', categoria: 'alumnos', orden: 10 },
]

const props = {
  cue: '12345678',
  escuelaNombre: 'Escuela N° 45',
  turnos,
  motivos,
}

// Forma real de GET /api/problematicas/parte?cue=... (mismo contrato que
// EstadoActualParte): una afectación vigente sin cambios.
const RESPUESTA_BASE = {
  ok: true,
  periodo: { id: 'periodo-1', nombre: 'ENOS 2026' },
  parte: {
    id: 'parte-1',
    cueAnexo: '12345678',
    estadoEstablecimiento: 'habitual',
    estadoEstablecimientoRigeDesde: '2026-09-01T00:00:00.000Z',
    actualizadaEn: '2026-09-01T00:00:00.000Z',
  },
  servicio: { estadoGeneral: 'normal', alcanceVigente: [] },
  afectaciones: [
    {
      id: 'af-1',
      motivo: 'Inundación',
      categoria: 'establecimiento',
      severidad: 'Media',
      descripcion: null,
      rigeDesde: '2026-09-01T00:00:00.000Z',
      secciones: [{ geSectionId: 10, seccionCompleta: true, alumnos: [] }],
      totales: { secciones: 1, alumnos: 0 },
    },
  ],
  secciones: [
    { geSectionId: 10, turno: 'Mañana' },
    { geSectionId: 11, turno: 'Mañana' },
    { geSectionId: 20, turno: 'Tarde' },
  ],
  ultimaActualizacion: '2026-09-01T00:00:00.000Z',
}

function stubFetchInicial(overrides = {}) {
  const respuestaGet = { ...RESPUESTA_BASE, ...overrides }
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).startsWith('/api/problematicas/parte?')) return jsonResponse(respuestaGet)
    return jsonResponse(
      {
        ok: true,
        movimientoId: 'm2',
        tipo: 'actualizacion',
        cambios: [],
        servicio: { estadoGeneral: 'normal', alcanceVigente: [] },
      },
      201,
    )
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderFormulario() {
  return render(
    <ActualizacionForm
      cue={props.cue}
      escuelaNombre={props.escuelaNombre}
      turnos={props.turnos}
      motivos={props.motivos}
    />,
  )
}

beforeEach(() => {
  if (typeof globalThis.crypto?.randomUUID !== 'function') {
    vi.stubGlobal('crypto', { ...globalThis.crypto, randomUUID: () => '00000000-0000-4000-8000-000000000000' })
  }
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('ActualizacionForm', () => {
  it('sin ningún cambio, el botón Revisar cambios queda deshabilitado', async () => {
    stubFetchInicial()
    renderFormulario()

    await screen.findByText(props.escuelaNombre)

    expect(screen.getByRole('button', { name: /revisar cambios/i })).toBeDisabled()
    expect(screen.getByText(/todavía no realizó cambios en el parte actual/i)).toBeVisible()
  })

  it('cambiar la severidad de la afectación vigente habilita Revisar cambios y lo muestra en el resumen', async () => {
    stubFetchInicial()
    renderFormulario()

    await screen.findByText(props.escuelaNombre)

    fireEvent.change(screen.getByLabelText(/^severidad/i), { target: { value: 'Alta' } })

    expect(screen.getByRole('button', { name: /revisar cambios/i })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: /revisar cambios/i }))

    expect(screen.getByRole('heading', { name: 'Cambios que se registrarán' })).toBeInTheDocument()
    expect(screen.getByText(/Media.*Alta/)).toBeInTheDocument()
  })

  it('"Volver y corregir" devuelve al formulario con el estado intacto', async () => {
    stubFetchInicial()
    renderFormulario()

    await screen.findByText(props.escuelaNombre)

    fireEvent.change(screen.getByLabelText(/^severidad/i), { target: { value: 'Alta' } })
    fireEvent.click(screen.getByRole('button', { name: /revisar cambios/i }))

    expect(screen.getByRole('heading', { name: 'Cambios que se registrarán' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /volver y corregir/i }))

    expect(screen.getByRole('button', { name: /revisar cambios/i })).toBeInTheDocument()
    expect((screen.getByLabelText(/^severidad/i) as HTMLSelectElement).value).toBe('Alta')
  })

  it('guardar una actualización hace POST con el payload esperado y muestra la confirmación', async () => {
    const fetchMock = stubFetchInicial()
    renderFormulario()

    await screen.findByText(props.escuelaNombre)

    fireEvent.change(screen.getByLabelText(/^severidad/i), { target: { value: 'Alta' } })
    fireEvent.click(screen.getByRole('button', { name: /revisar cambios/i }))
    fireEvent.click(screen.getByRole('button', { name: /guardar actualización/i }))

    expect(
      await screen.findByText(
        'La actualización fue registrada. El estado actual y el historial ya reflejan los cambios informados.',
      ),
    ).toBeInTheDocument()

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })
    const [url, init] = fetchMock.mock.calls[1]
    expect(String(url)).toBe('/api/problematicas/parte')
    expect(init?.method).toBe('POST')
    const body = JSON.parse(String(init?.body))
    expect(body.afectacionesModificadas).toHaveLength(1)
    expect(body.afectacionesModificadas[0].severidad).toBe('Alta')
  })

  it('el recordatorio de motivo duplicado en la actualización se muestra pero no bloquea el envío', async () => {
    stubFetchInicial()
    renderFormulario()

    await screen.findByText(props.escuelaNombre)

    fireEvent.click(screen.getByRole('button', { name: /agregar afectación/i }))

    const radiosEstablecimiento = screen.getAllByRole('radio', { name: /afecta al establecimiento/i })
    fireEvent.click(radiosEstablecimiento[radiosEstablecimiento.length - 1])

    const motivoSelects = screen.getAllByLabelText(/^motivo/i)
    fireEvent.change(motivoSelects[motivoSelects.length - 1], { target: { value: 'Inundación' } })

    const severidadSelects = screen.getAllByLabelText(/^severidad/i)
    fireEvent.change(severidadSelects[severidadSelects.length - 1], { target: { value: 'Alta' } })

    const seccionCheckboxes = screen.getAllByRole('checkbox', { name: /1° \"A\"/ })
    fireEvent.click(seccionCheckboxes[seccionCheckboxes.length - 1])

    const recordatorios = screen.getAllByText(/Ya agregó una afectación con un motivo o categoría similar/i)
    expect(recordatorios.length).toBeGreaterThan(0)
    for (const recordatorio of recordatorios) {
      expect(recordatorio).toHaveAttribute('role', 'status')
    }
    expect(screen.queryByRole('alert')).toBeNull()

    expect(screen.getByRole('button', { name: /revisar cambios/i })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: /revisar cambios/i }))
    expect(screen.getByRole('heading', { name: 'Cambios que se registrarán' })).toBeInTheDocument()
  })

  it('si falla la conexión al guardar, la información ingresada se mantiene y se muestra el error de la sección 17', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).startsWith('/api/problematicas/parte?')) return jsonResponse(RESPUESTA_BASE)
      throw new Error('network')
    })
    vi.stubGlobal('fetch', fetchMock)

    renderFormulario()
    await screen.findByText(props.escuelaNombre)

    fireEvent.change(screen.getByLabelText(/^severidad/i), { target: { value: 'Alta' } })
    fireEvent.click(screen.getByRole('button', { name: /revisar cambios/i }))
    fireEvent.click(screen.getByRole('button', { name: /guardar actualización/i }))

    expect(
      await screen.findByText(
        'No pudimos guardar la actualización. La información ingresada se mantiene para que pueda volver a intentar.',
      ),
    ).toBeInTheDocument()

    expect(screen.getByRole('heading', { name: 'Cambios que se registrarán' })).toBeInTheDocument()
    expect(screen.getByText(/Media.*Alta/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /volver y corregir/i }))
    expect((screen.getByLabelText(/^severidad/i) as HTMLSelectElement).value).toBe('Alta')
  })
})