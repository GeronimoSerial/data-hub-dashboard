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
    <ActualizacionForm cue={props.cue} turnos={props.turnos} motivos={props.motivos} />,
  )
}

/** Espera a que cargue el parte. La lista se lee sin abrir nada. */
async function esperarParteCargado() {
  await screen.findByRole('heading', { name: 'Inundación' })
}

/**
 * Pone en edición la situación ya informada. La tarjeta no es un contenedor
 * que se abre: afirma lo que pasa y ofrece "Cambió algo" para corregirla.
 */
async function editarAfectacionVigente() {
  await esperarParteCargado()
  fireEvent.click(screen.getByRole('button', { name: 'Cambió algo' }))
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

    await editarAfectacionVigente()

    expect(screen.getByRole('button', { name: /revisar cambios/i })).toBeDisabled()
    expect(screen.getByText(/todavía no realizó cambios en el parte actual/i)).toBeVisible()
  })

  it('cambiar la severidad de la afectación vigente habilita Revisar cambios y lo muestra en el resumen', async () => {
    stubFetchInicial()
    renderFormulario()

    await editarAfectacionVigente()

    fireEvent.click(screen.getByRole('radio', { name: 'Alta' }))

    expect(screen.getByRole('button', { name: /revisar cambios/i })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: /revisar cambios/i }))

    expect(screen.getByRole('heading', { name: 'Cambios que se registrarán' })).toBeInTheDocument()
    expect(screen.getByText(/Media.*Alta/)).toBeInTheDocument()
  })

  it('"Volver y corregir" devuelve al formulario con el estado intacto', async () => {
    stubFetchInicial()
    renderFormulario()

    await editarAfectacionVigente()

    fireEvent.click(screen.getByRole('radio', { name: 'Alta' }))
    fireEvent.click(screen.getByRole('button', { name: /revisar cambios/i }))

    expect(screen.getByRole('heading', { name: 'Cambios que se registrarán' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /volver y corregir/i }))

    expect(screen.getByRole('button', { name: /revisar cambios/i })).toBeInTheDocument()
    // Se vuelve al inventario, donde la afectación aparece plegada con su
    // resumen ya corregido; abrirla muestra el dato intacto.
    await editarAfectacionVigente()
    expect(screen.getByRole('radio', { name: 'Alta' })).toBeChecked()
  })

  it('guardar una actualización hace POST con el payload esperado y muestra la confirmación', async () => {
    const fetchMock = stubFetchInicial()
    renderFormulario()

    await editarAfectacionVigente()

    fireEvent.click(screen.getByRole('radio', { name: 'Alta' }))
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

    await editarAfectacionVigente()

    fireEvent.click(screen.getByRole('button', { name: /agregar otra situación/i }))

    const radiosEstablecimiento = screen.getAllByRole('radio', { name: /afecta al establecimiento/i })
    fireEvent.click(radiosEstablecimiento[radiosEstablecimiento.length - 1])

    const motivoRadios = screen.getAllByRole('radio', { name: 'Inundación' })
    fireEvent.click(motivoRadios[motivoRadios.length - 1])

    const severidadRadios = screen.getAllByRole('radio', { name: 'Alta' })
    fireEvent.click(severidadRadios[severidadRadios.length - 1])

    const seccionCheckboxes = screen.getAllByRole('checkbox', { name: /1° \"A\"/ })
    fireEvent.click(seccionCheckboxes[seccionCheckboxes.length - 1])

    // El aviso ahora es un badge y sólo sale por motivo exacto repetido sobre
    // una situación que se está agregando ahora. "Inundación" ya figura en el
    // parte vigente, así que corresponde.
    const recordatorios = screen.getAllByText('Ya informado')
    expect(recordatorios.length).toBeGreaterThan(0)
    for (const recordatorio of recordatorios) {
      // §18.14: recomienda, nunca decide — role="status", nunca "alert".
      expect(recordatorio.closest('[role]')).toHaveAttribute('role', 'status')
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
    await editarAfectacionVigente()

    fireEvent.click(screen.getByRole('radio', { name: 'Alta' }))
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
    // Se vuelve al inventario, donde la afectación aparece plegada con su
    // resumen ya corregido; abrirla muestra el dato intacto.
    await editarAfectacionVigente()
    expect(screen.getByRole('radio', { name: 'Alta' })).toBeChecked()
  })
})
describe('ActualizacionForm — lo vigente se afirma, no se vuelve a preguntar', () => {
  it('abre mostrando el estado vigente cerrado, sin grupos de radio a medio llenar', async () => {
    stubFetchInicial()
    renderFormulario()

    await esperarParteCargado()

    // Antes se leía "Estado actual: X" y debajo radios TODOS vacíos, que se
    // ve como un formulario sin completar.
    expect(screen.getByText('Clases normales')).toBeInTheDocument()
    expect(screen.getByText('Funcionamiento habitual')).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'Clases suspendidas' })).toBeNull()
    expect(screen.queryByRole('radio', { name: 'Establecimiento evacuado' })).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Cambiar' }).length).toBeGreaterThanOrEqual(2)
  })

  it('"Cambiar" abre las opciones y "Dejar como está" las cierra borrando la selección', async () => {
    stubFetchInicial()
    renderFormulario()

    await esperarParteCargado()

    const [cambiarClases] = screen.getAllByRole('button', { name: 'Cambiar' })
    fireEvent.click(cambiarClases)

    fireEvent.click(screen.getByRole('radio', { name: 'Clases suspendidas' }))
    expect(screen.getByRole('button', { name: /revisar cambios/i })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: 'Dejar como está' }))

    expect(screen.queryByRole('radio', { name: 'Clases suspendidas' })).toBeNull()
    expect(screen.getByRole('button', { name: /revisar cambios/i })).toBeDisabled()
  })

  // El alcance describe a quiénes alcanza una SUSPENSIÓN: preguntarlo tras
  // elegir "Clases normales" no quiere decir nada.
  it('el alcance sólo se pregunta al suspender las clases', async () => {
    stubFetchInicial()
    renderFormulario()

    await esperarParteCargado()

    const [cambiarClases] = screen.getAllByRole('button', { name: 'Cambiar' })
    fireEvent.click(cambiarClases)

    fireEvent.click(screen.getByRole('radio', { name: 'Clases normales' }))
    expect(screen.queryByRole('radio', { name: 'Todo el establecimiento' })).toBeNull()

    fireEvent.click(screen.getByRole('radio', { name: 'Clases suspendidas' }))
    expect(screen.getByRole('radio', { name: 'Todo el establecimiento' })).toBeInTheDocument()
  })

  it('lista los cambios sin guardar mientras se edita, no recién al confirmar', async () => {
    stubFetchInicial()
    renderFormulario()

    await editarAfectacionVigente()

    expect(screen.getByText(/todavía no realizó cambios/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: 'Alta' }))

    expect(screen.getByRole('heading', { name: /sin guardar: 1 cambio/i })).toBeInTheDocument()
    expect(screen.getByText(/Media.*Alta/)).toBeInTheDocument()
  })
})

describe('ActualizacionForm — un parte intacto no inventa cambios', () => {
  /*
    Regresión encontrada en el navegador: la pantalla abría declarando "24
    alumnos retirados de Anegamiento" para cada afectación vigente, sin que
    el director tocara nada, y habilitaba el guardado contra spec §17.

    Se reproduce cuando la API entrega el padrón enumerado de una sección
    completa y el contexto del corte (`turnos`) entrega esa misma sección SIN
    padrón — lo que pasa, por ejemplo, si las identidades de los alumnos no se
    pueden resolver. Una sección completa significa "todos, quienes sean", así
    que las dos enumeraciones no deben compararse.
  */
  it('con el padrón enumerado del lado de la API y vacío del lado del corte, no hay cambios', async () => {
    stubFetchInicial({
      afectaciones: [
        {
          ...RESPUESTA_BASE.afectaciones[0],
          secciones: [
            {
              geSectionId: 10,
              seccionCompleta: true,
              alumnos: Array.from({ length: 12 }, (_, i) => ({
                gePersonId: 1000 + i,
                nombre: String(1000 + i),
                apellido: '',
              })),
            },
          ],
        },
      ],
    })
    renderFormulario()

    await esperarParteCargado()

    expect(screen.getByText(/todavía no realizó cambios/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /revisar cambios/i })).toBeDisabled()
  })
})
