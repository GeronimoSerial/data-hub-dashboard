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

const props = { cue: '12345678', turnos, motivos }

function renderFormulario() {
  return render(<ReporteInicialForm cue={props.cue} turnos={props.turnos} motivos={props.motivos} />)
}

const continuar = () => fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
const volver = () => fireEvent.click(screen.getByRole('button', { name: 'Volver' }))

/** Paso 1: tipo de problema, motivo y severidad. */
function completarQuePaso() {
  fireEvent.click(screen.getByRole('radio', { name: /Afecta al establecimiento/ }))
  fireEvent.click(screen.getByRole('radio', { name: 'Inundación' }))
  fireEvent.click(screen.getByRole('radio', { name: 'Alta' }))
}

/** Paso 2: al menos una sección. */
function completarAQuienAfecta() {
  fireEvent.click(screen.getByRole('checkbox', { name: /1° "A"/ }))
}

/** Deja el asistente en el paso 4, listo para guardar. */
function llegarAConfirmar() {
  completarQuePaso()
  continuar()
  completarAQuienAfecta()
  continuar()
  continuar()
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
  // El motivo de fondo del rediseño: la pantalla anterior abría con un título
  // "Afectaciones" vacío y un botón de agregar, y se leía como una invitación
  // a encadenar problemas. El primer reporte declara UN hecho.
  it('no ofrece agregar afectaciones en ningún paso', () => {
    renderFormulario()

    expect(screen.queryByRole('button', { name: /agregar afectación/i })).toBeNull()

    completarQuePaso()
    continuar()
    expect(screen.queryByRole('button', { name: /agregar afectación/i })).toBeNull()

    completarAQuienAfecta()
    continuar()
    expect(screen.queryByRole('button', { name: /agregar afectación/i })).toBeNull()
  })

  it('arranca en el primer paso y muestra en qué paso está', () => {
    renderFormulario()

    expect(screen.getByText('Paso 1 de 4')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '¿Qué pasó?' })).toBeInTheDocument()
  })

  // Motivo y severidad ya no son <select>: con 3 a 5 opciones el desplegable
  // cuesta tres gestos y tapa la pantalla.
  it('ofrece motivo y severidad como opciones a la vista, no como desplegables', () => {
    renderFormulario()

    expect(screen.queryByRole('combobox')).toBeNull()

    fireEvent.click(screen.getByRole('radio', { name: /Afecta al establecimiento/ }))

    expect(screen.getByRole('radio', { name: 'Inundación' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Tormenta severa' })).toBeInTheDocument()
    // El motivo de la otra categoría no se ofrece.
    expect(screen.queryByRole('radio', { name: 'Anegamiento' })).toBeNull()
    expect(screen.getByRole('radio', { name: 'Crítica' })).toBeInTheDocument()
  })

  it('muestra la glosa de cada categoría, que antes existía sin mostrarse', () => {
    renderFormulario()

    expect(screen.getByText('La escuela o parte de ella queda fuera de servicio.')).toBeInTheDocument()
    expect(screen.getByText('La escuela funciona, pero hay alumnos que no pueden llegar.')).toBeInTheDocument()
  })

  it('no avanza del primer paso sin tipo, motivo y severidad, y dice qué falta', () => {
    renderFormulario()

    continuar()

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Elija el tipo de problema, el motivo y la severidad para continuar.',
    )
    expect(screen.getByRole('heading', { name: '¿Qué pasó?' })).toBeInTheDocument()
  })

  it('no avanza del segundo paso sin secciones elegidas', () => {
    renderFormulario()

    completarQuePaso()
    continuar()
    expect(screen.getByRole('heading', { name: '¿A quiénes afecta?' })).toBeInTheDocument()

    continuar()

    expect(screen.getByRole('alert')).toHaveTextContent('Elija al menos una sección afectada para continuar.')
    expect(screen.getByRole('heading', { name: '¿A quiénes afecta?' })).toBeInTheDocument()
  })

  it('exige el alcance cuando se suspenden las clases', () => {
    renderFormulario()

    completarQuePaso()
    continuar()
    completarAQuienAfecta()
    continuar()

    fireEvent.click(screen.getByRole('radio', { name: 'Clases suspendidas' }))
    continuar()
    expect(screen.getByRole('alert')).toHaveTextContent('Indique el alcance de la suspensión.')

    // Elegir "uno o más turnos" y no marcar ninguno tampoco alcanza.
    fireEvent.click(screen.getByRole('radio', { name: 'Uno o más turnos' }))
    continuar()
    expect(screen.getByRole('alert')).toHaveTextContent('Indique a qué turnos alcanza la suspensión.')

    fireEvent.click(screen.getByRole('checkbox', { name: 'Mañana' }))
    continuar()
    expect(screen.getByRole('heading', { name: 'Confirmar' })).toBeInTheDocument()
  })

  it('el alcance sólo se pregunta si hay suspensión', () => {
    renderFormulario()

    completarQuePaso()
    continuar()
    completarAQuienAfecta()
    continuar()

    expect(screen.queryByRole('radio', { name: 'Todo el establecimiento' })).toBeNull()

    fireEvent.click(screen.getByRole('radio', { name: 'Clases suspendidas' }))

    expect(screen.getByRole('radio', { name: 'Todo el establecimiento' })).toBeInTheDocument()
  })

  it('volver conserva lo ya cargado', () => {
    renderFormulario()

    completarQuePaso()
    continuar()
    completarAQuienAfecta()
    volver()

    expect(screen.getByRole('radio', { name: 'Inundación' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Alta' })).toBeChecked()
  })

  it('el último paso resume en lenguaje llano lo que se va a informar', () => {
    renderFormulario()

    llegarAConfirmar()

    expect(screen.getByRole('heading', { name: 'Confirmar' })).toBeInTheDocument()
    expect(screen.getByText('Inundación · Severidad Alta')).toBeInTheDocument()
    expect(screen.getByText('1 sección · 28 alumnos')).toBeInTheDocument()
  })

  // Se acabó el botón gris sin explicación: llegar al paso 4 ya exige los
  // datos obligatorios, así que guardar siempre está habilitado.
  it('el botón de guardar sólo existe en el último paso y llega habilitado', () => {
    renderFormulario()

    expect(screen.queryByRole('button', { name: /guardar reporte/i })).toBeNull()

    llegarAConfirmar()

    expect(screen.getByRole('button', { name: /guardar reporte/i })).toBeEnabled()
  })

  /*
    Regresión de un bug encontrado en el navegador, no en jsdom: React
    reconciliaba "Continuar" y "Guardar reporte" como el MISMO nodo del DOM y
    sólo le cambiaba el `type`. El click que avanzaba al paso 4 corría el
    handler, React reescribía type="submit" sobre ese mismo botón y recién
    entonces el navegador ejecutaba la acción por defecto del click — que ya
    era enviar el formulario. Un solo toque en "Continuar" guardaba el reporte
    sin que el director llegara a ver el resumen.

    jsdom NO reproduce ese encadenamiento (fireEvent.click no dispara la
    acción por defecto del submit), así que un test que sólo mire `fetch`
    pasa igual con el bug puesto — lo verifiqué. Lo que sí se puede afirmar
    acá es la propiedad estructural que lo causaba: que el botón de guardar
    sea un nodo distinto del de continuar, y que antes del último paso no
    exista ningún botón de submit en el formulario.
  */
  it('el botón de guardar es un nodo distinto del de continuar, no el mismo con otro type', () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true, movimientoId: 'm1' }, 201))
    vi.stubGlobal('fetch', fetchMock)

    const { container } = renderFormulario()

    completarQuePaso()
    continuar()
    completarAQuienAfecta()
    continuar()

    const continuarEnPaso3 = screen.getByRole('button', { name: 'Continuar' })
    expect(container.querySelectorAll('button[type="submit"]')).toHaveLength(0)

    continuar()

    const guardar = screen.getByRole('button', { name: /guardar reporte/i })
    expect(guardar).not.toBe(continuarEnPaso3)
    expect(continuarEnPaso3.isConnected).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('al guardar hace POST a /api/problematicas/parte con una sola afectación', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true, movimientoId: 'm1' }, 201))
    vi.stubGlobal('fetch', fetchMock)

    renderFormulario()

    llegarAConfirmar()
    fireEvent.click(screen.getByRole('button', { name: /guardar reporte/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
      expect(String(url)).toBe('/api/problematicas/parte')
      expect(init?.method).toBe('POST')
      const body = JSON.parse(String(init?.body))
      expect(body.cue).toBe(props.cue)
      expect(typeof body.idempotencyKey).toBe('string')
      expect(body.idempotencyKey.length).toBeGreaterThan(0)
      expect(typeof body.rigeDesde).toBe('string')
      expect(body.afectacionesNuevas).toHaveLength(1)
      expect(body.afectacionesNuevas[0]).toMatchObject({
        motivo: 'Inundación',
        severidad: 'Alta',
        secciones: [10],
      })
      expect(body.afectacionesModificadas).toEqual([])
      expect(body.afectacionesRetiradas).toEqual([])
    })
  })

  it('una respuesta exitosa reemplaza el asistente por la confirmación del reporte', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ ok: true, parteId: 'p1', movimientoId: 'm1', tipo: 'reporte_inicial', cambios: [] }, 201),
    )
    vi.stubGlobal('fetch', fetchMock)

    renderFormulario()

    llegarAConfirmar()
    fireEvent.click(screen.getByRole('button', { name: /guardar reporte/i }))

    // El texto habla del reporte, no de "la actualización": esta pantalla es
    // el primer reporte y no hay nada previo que actualizar.
    expect(
      await screen.findByText(
        'El reporte fue registrado. El estado actual y el historial ya reflejan lo informado.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /guardar reporte/i })).toBeNull()
  })

  it('una respuesta fallida muestra el error del servidor y conserva lo ingresado', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: 'boom' }, 500))
    vi.stubGlobal('fetch', fetchMock)

    renderFormulario()

    llegarAConfirmar()
    fireEvent.click(screen.getByRole('button', { name: /guardar reporte/i }))

    expect(await screen.findByText('boom')).toBeInTheDocument()
    expect(screen.getByText('Inundación · Severidad Alta')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /guardar reporte/i })).toBeEnabled()
  })

  it('un error de red muestra el mensaje genérico del reporte y conserva lo ingresado', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('network')
    })
    vi.stubGlobal('fetch', fetchMock)

    renderFormulario()

    llegarAConfirmar()
    fireEvent.click(screen.getByRole('button', { name: /guardar reporte/i }))

    expect(
      await screen.findByText(
        'No pudimos guardar el reporte. La información ingresada se mantiene para que pueda volver a intentar.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('Inundación · Severidad Alta')).toBeInTheDocument()
  })

  it('muestra Guardando mientras se envía', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))

    renderFormulario()

    llegarAConfirmar()
    fireEvent.click(screen.getByRole('button', { name: /guardar reporte/i }))

    expect(screen.getByRole('status')).toHaveTextContent('Guardando…')
    expect(screen.getByRole('button', { name: /guardando/i })).toBeInTheDocument()
  })
})
