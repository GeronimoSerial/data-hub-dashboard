// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReporteInicialForm } from './reporte-inicial-form'
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

function renderFormulario() {
  return render(
    <ReporteInicialForm
      cue={props.cue}
      escuelaNombre={props.escuelaNombre}
      turnos={props.turnos}
      motivos={props.motivos}
    />,
  )
}

// Llena una afectación completa: categoría, motivo, severidad y una sección.
function rellenarAfectacionCompleta() {
  fireEvent.click(screen.getByRole('button', { name: /agregar afectación/i }))
  fireEvent.click(screen.getByRole('radio', { name: /afecta al establecimiento/i }))
  fireEvent.change(screen.getByLabelText(/^motivo/i), { target: { value: 'Inundación' } })
  fireEvent.change(screen.getByLabelText(/^severidad/i), { target: { value: 'Alta' } })
  fireEvent.click(screen.getByRole('checkbox', { name: /1° "A"/ }))
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

describe('ReporteInicialForm', () => {
  it('el botón de guardar está deshabilitado cuando el formulario está vacío', () => {
    renderFormulario()

    expect(screen.getByRole('button', { name: /guardar reporte/i })).toBeDisabled()
  })

  it('agregar una afectación y completarla habilita el botón de guardar', () => {
    renderFormulario()

    expect(screen.getByRole('button', { name: /guardar reporte/i })).toBeDisabled()

    rellenarAfectacionCompleta()

    expect(screen.getByRole('heading', { name: /afectación 1/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /guardar reporte/i })).toBeEnabled()
  })

  it('una afectación a medio llenar no habilita el botón de guardar', () => {
    renderFormulario()

    fireEvent.click(screen.getByRole('button', { name: /agregar afectación/i }))
    fireEvent.click(screen.getByRole('radio', { name: /afecta al establecimiento/i }))

    expect(screen.getByRole('button', { name: /guardar reporte/i })).toBeDisabled()
  })

  it('solo elegir "Clases suspendidas" con alcance de todo el establecimiento habilita el guardado sin afectaciones', () => {
    renderFormulario()

    fireEvent.click(screen.getByRole('radio', { name: 'Clases suspendidas' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Todo el establecimiento' }))

    expect(screen.getByRole('button', { name: /guardar reporte/i })).toBeEnabled()
  })

  it('al enviar un formulario válido hace POST a /api/problematicas/parte con las claves esperadas', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      jsonResponse({ ok: true, movimientoId: 'm1' }, 201),
    )
    vi.stubGlobal('fetch', fetchMock)

    renderFormulario()

    rellenarAfectacionCompleta()
    fireEvent.click(screen.getByRole('button', { name: /guardar reporte/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [url, init] = fetchMock.mock.calls[0]
      expect(String(url)).toBe('/api/problematicas/parte')
      expect(init?.method).toBe('POST')
      const body = JSON.parse(String(init?.body))
      expect(body.cue).toBe(props.cue)
      expect(typeof body.idempotencyKey).toBe('string')
      expect(body.idempotencyKey.length).toBeGreaterThan(0)
      expect(typeof body.rigeDesde).toBe('string')
      expect(body.afectacionesNuevas).toHaveLength(1)
      expect(body.afectacionesModificadas).toEqual([])
      expect(body.afectacionesRetiradas).toEqual([])
    })
  })

  it('una respuesta exitosa reemplaza el formulario por la confirmación', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(
        {
          ok: true,
          parteId: 'p1',
          movimientoId: 'm1',
          tipo: 'reporte_inicial',
          cambios: [],
          servicio: { estadoGeneral: 'normal', alcanceVigente: [] },
        },
        201,
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    renderFormulario()

    rellenarAfectacionCompleta()
    fireEvent.click(screen.getByRole('button', { name: /guardar reporte/i }))

    expect(
      await screen.findByText('La actualización fue registrada. El estado actual y el historial ya reflejan los cambios informados.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /guardar reporte/i })).toBeNull()
  })

  it('una respuesta fallida muestra el error del servidor y conserva los datos ingresados', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: 'boom' }, 500))
    vi.stubGlobal('fetch', fetchMock)

    renderFormulario()

    rellenarAfectacionCompleta()
    fireEvent.click(screen.getByRole('button', { name: /guardar reporte/i }))

    expect(await screen.findByText('boom')).toBeInTheDocument()

    expect(screen.getByText(props.escuelaNombre)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /afectación 1/i })).toBeInTheDocument()
    expect((screen.getByLabelText(/^motivo/i) as HTMLSelectElement).value).toBe('Inundación')
    expect(screen.getByRole('button', { name: /guardar reporte/i })).toBeEnabled()
  })

  it('un error de red (fetch rechazado) muestra el mensaje genérico y conserva los datos', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('network')
    })
    vi.stubGlobal('fetch', fetchMock)

    renderFormulario()

    rellenarAfectacionCompleta()
    fireEvent.click(screen.getByRole('button', { name: /guardar reporte/i }))

    expect(
      await screen.findByText('No pudimos guardar la actualización. La información ingresada se mantiene para que pueda volver a intentar.'),
    ).toBeInTheDocument()
    expect(screen.getByText(props.escuelaNombre)).toBeInTheDocument()
    expect((screen.getByLabelText(/^motivo/i) as HTMLSelectElement).value).toBe('Inundación')
  })
})