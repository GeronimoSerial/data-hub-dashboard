// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { render, screen, fireEvent, waitFor, cleanup, within, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MENSAJE_BORRADOR_PENDIENTE, ReporteInicialForm } from './reporte-inicial-form'
import { jsonResponse } from '@/lib/infraestructura/test-utils/http'
import { motivos, turnos } from '@/components/test-utils/parte-formulario'
import { CLAVE_VINCULO_VERIFICACION } from './verificacion-vinculo'
import { MENSAJES_ESTADO, guardarBorrador as guardarBorradorEnvio } from '@/lib/infraestructura/parte/envio-offline'
import { crearAlmacenParte, abrirAlmacenParte } from '@/lib/infraestructura/parte/almacen-indexeddb'
import { crearColaTrabajosEnvio } from '@/lib/infraestructura/parte/cola-trabajos-envio'

const props = { cue: '12345678', turnos, motivos }

const MENSAJE_REPORTE_EXITOSO =
  'Ya figura en el estado actual de su escuela.'

function sembrarBorradorWizard({
  paso = 2,
  version,
  sinCamposNuevos = false,
  categoria = 'alumnos',
  motivo = 'Anegamiento',
  cue = props.cue,
}: {
  paso?: 1 | 2 | 3 | 4 | 5
  version?: number
  sinCamposNuevos?: boolean
  categoria?: 'alumnos' | 'establecimiento'
  motivo?: string
  cue?: string
} = {}) {
  const borrador = {
    generacion: 'generacion-test',
    ...(version ? { version } : {}),
    paso,
    afectacion: {
      clientId: 'afectacion-test',
      categoria,
      motivo,
      severidad: 'Alta',
      descripcion: '',
      secciones: [],
      alumnos: [],
    },
    servicioEstado: '',
    estadoEstablecimiento: '',
    rigeDesde: '2026-10-04T10:00:00.000Z',
    ...(sinCamposNuevos ? {} : { asistenciaBrinda: 'no', modalidadesAsistencia: [], vigencia: { modo: 'ahora' } }),
  }
  localStorage.setItem(`parte-nuevo:draft:${cue}`, JSON.stringify(borrador))
}

function renderFormulario(overrides: Partial<typeof props> = {}) {
  return render(<ReporteInicialForm {...props} {...overrides} />)
}

function stubFetch(respuesta: unknown = { ok: true, movimientoId: 'm1' }, status = 201) {
  const fetchMock = vi.fn(async () => jsonResponse(respuesta, status))
  stubFetchMock(fetchMock)
  return fetchMock
}

function stubFetchMock(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input).includes('/borradores/config')) return jsonResponse({ borradoresSync: false, fotos: false, mapaBorradores: false })
    return (fetchMock as (input: string | URL | Request, init?: RequestInit) => Promise<Response>)(input, init)
  })
}

const continuar = () => fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
const volver = () => fireEvent.click(screen.getByRole('button', { name: 'Volver' }))
const resumenConfirmacion = () => document.querySelector('.asistente__resumen-lista') as HTMLElement
const textoAlertas = () => screen.getAllByRole('alert').map((alerta) => alerta.textContent).join(' ')
const confirmarCategoria = () =>
  screen.queryByRole('dialog') && fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Continuar' }))

/** Paso 1: tipo de problema, motivo y severidad. */
function completarQuePaso() {
  fireEvent.click(screen.getByRole('radio', { name: /Afecta al establecimiento/ }))
  confirmarCategoria()
  fireEvent.click(screen.getByRole('radio', { name: 'Inundación' }))
  fireEvent.click(screen.getByRole('radio', { name: 'Alta' }))
}

/** Paso 2: alcance por sección o por alumno, según la categoría. */
function completarAQuienAfecta(categoria: 'alumnos' | 'establecimiento' = 'establecimiento') {
  if (categoria === 'alumnos') {
    const seccion = turnos[0].niveles[0].secciones[0]
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`${seccion.curso} "${seccion.division}"`) }))
    const alumno = seccion.alumnos[0]
    fireEvent.click(screen.getByRole('checkbox', { name: `${alumno.apellido}, ${alumno.nombre}` }))
    return
  }
  fireEvent.click(screen.getByRole('radio', { name: 'Algunas secciones' }))
  fireEvent.click(screen.getByRole('checkbox', { name: /1° "A"/ }))
}

/** Paso 3: ¿hay clases? y cómo está el edificio (obligatorio). */
function completarEstadoEstablecimiento() {
  fireEvent.click(screen.getByRole('radio', { name: 'Sí, con normalidad' }))
  fireEvent.click(screen.getByRole('radio', { name: 'Sin daños / en uso normal' }))
}

/** Deja el asistente en el último paso (Confirmar), listo para guardar. */
function llegarAConfirmar() {
  completarQuePaso()
  continuar()
  completarAQuienAfecta()
  continuar()
  completarEstadoEstablecimiento()
  continuar()
  // Paso 4: "¿Desde cuándo?" se deja en "Ahora".
  continuar()
}

function guardarReporte() {
  llegarAConfirmar()
  fireEvent.click(screen.getByRole('button', { name: /guardar situación/i }))
}

beforeEach(() => {
  cleanup()
  localStorage.clear()
  sessionStorage.clear()
  globalThis.indexedDB = new IDBFactory()
  if (typeof globalThis.crypto?.randomUUID !== 'function') {
    vi.stubGlobal('crypto', { ...globalThis.crypto, randomUUID: () => '00000000-0000-4000-8000-000000000000' })
  }
})

afterEach(() => {
  // Desmonta de verdad (los listeners de popstate y el root de React viven
  // fuera del DOM) y olvida el borrador: cada test arranca limpio.
  cleanup()
  sessionStorage.clear()
  localStorage.clear()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  globalThis.indexedDB = new IDBFactory()
  document.body.innerHTML = ''
})

describe('ReporteInicialForm', () => {
  it('shows a B2 confirmation on reopen without restoring the sent draft or removing photo work', async () => {
    const id = `parte-inicial:${props.cue}`
    const almacen = await abrirAlmacenParte()
    await almacen.guardarContexto({ draftId: id, idempotencyKey: 'sent-initial' })
    expect(await almacen.obtenerContexto<{ draftId: string; idempotencyKey?: string }>(id)).toMatchObject({
      draftId: id,
      idempotencyKey: 'sent-initial',
    })
    await almacen.guardarBorrador({ draftId: id, generacion: 1, version: 1, datos: { invalidForRestore: true }, actualizadoEn: new Date().toISOString() })
    const cola = crearColaTrabajosEnvio(almacen)
    await cola.encolar({ tipo: 'foto', idempotencyKey: 'photo-initial', draftId: id, cuerpo: { attachmentId: 'photo-1' } })
    await cola.confirmar('sent-initial', { movimientoId: 'movement-initial', rigeDesde: new Date().toISOString(), cierreDraft: 'enviado' })

    renderFormulario()

    expect(await screen.findByRole('heading', { name: 'Situación guardada' })).toBeInTheDocument()
    await waitFor(async () => expect(await almacen.obtenerBorrador(id)).toBeNull())
    expect(await almacen.obtenerTrabajosEnvio()).toMatchObject([{ idempotencyKey: 'photo-initial', tipo: 'foto' }])
  })

  it('migra el borrador legacy a IndexedDB antes de habilitar su guardado', async () => {
    sembrarBorradorWizard()
    renderFormulario()
    await waitFor(async () => {
      const store = await abrirAlmacenParte()
      const borrador = await store.obtenerBorrador(`parte-inicial:${props.cue}`)
      expect(borrador?.datos).toMatchObject({ paso: 2, generacion: 'generacion-test' })
    })
    expect(localStorage.getItem(`parte-nuevo:draft:${props.cue}`)).toBeNull()
  })

  it('conserva las referencias a fotos del borrador al guardar respuestas', async () => {
    const key = `parte-nuevo:draft:${props.cue}`
    sembrarBorradorWizard({ paso: 2 })
    const datos = JSON.parse(localStorage.getItem(key) ?? '{}')
    datos.referenciasFotos = ['foto-1']
    localStorage.setItem(key, JSON.stringify(datos))
    renderFormulario()
    await screen.findByRole('dialog', { name: MENSAJE_BORRADOR_PENDIENTE })
    fireEvent.click(screen.getByRole('button', { name: 'Continuar donde lo dejé' }))
    await waitFor(async () => {
      const store = await abrirAlmacenParte()
      expect((await store.obtenerBorrador(`parte-inicial:${props.cue}`))?.datos).toMatchObject({ referenciasFotos: ['foto-1'] })
    })
  })

  it('después de guardar, "Cargar otra situación" deja el botón de guardar habilitado (#73)', async () => {
    const fetchMock = stubFetch()
    renderFormulario()
    guardarReporte()
    await screen.findByText('Situación guardada')
    fireEvent.click(screen.getByRole('button', { name: 'Cargar otra situación' }))
    llegarAConfirmar()
    const boton = screen.getByRole('button', { name: /guardar situación/i })
    expect(boton).toBeEnabled()
    fireEvent.click(boton)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    await screen.findByText('Situación guardada')
  })

  it('confirma pasar a toda la escuela al declarar secciones y evacuación', () => {
    renderFormulario()
    completarQuePaso()
    continuar()
    completarAQuienAfecta()
    continuar()
    fireEvent.click(screen.getByRole('radio', { name: 'Evacuado' }))
    const dialogo = screen.getByRole('dialog')
    expect(within(dialogo).getByText(/interrumpe toda la escuela/)).toBeVisible()
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Sí, toda la escuela' }))
    expect(screen.getByRole('heading', { name: 'Clases y edificio' })).toBeVisible()
    continuar()
    expect(screen.getByRole('heading', { name: '¿Desde cuándo?' })).toBeVisible()
    continuar()
    expect(screen.getByRole('heading', { name: 'Confirmar' })).toBeVisible()
  })

  it('no pide confirmación al evacuar si se marcaron todas las secciones', () => {
    const unaSeccion = [{ ...turnos[0], niveles: [{ ...turnos[0].niveles[0], secciones: turnos[0].niveles[0].secciones.slice(0, 1) }] }]
    renderFormulario({ turnos: unaSeccion })
    completarQuePaso()
    continuar()
    fireEvent.click(screen.getByRole('radio', { name: 'Toda la escuela' }))
    fireEvent.click(screen.getByRole('button', { name: 'Mantener Alta' }))
    continuar()
    fireEvent.click(screen.getByRole('radio', { name: 'Evacuado' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('incluye asistencia pedagógica y modalidad en el cuerpo del reporte', async () => {
    const fetchMock = stubFetch()
    renderFormulario()
    completarQuePaso()
    continuar()
    completarAQuienAfecta()
    continuar()
    completarEstadoEstablecimiento()
    fireEvent.click(screen.getByRole('radio', { name: 'Sí' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Clase virtual' }))
    continuar()
    continuar()
    fireEvent.click(screen.getByRole('button', { name: /guardar situación/i }))
    await waitFor(() => {
      const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
      expect(JSON.parse(String(init.body)).asistenciaPedagogica).toEqual({ brinda: true, modalidades: ['Clase virtual'] })
    })
  })

  it('una Crítica justificada viaja al servidor con su justificación', async () => {
    const fetchMock = stubFetch()
    renderFormulario()
    fireEvent.click(screen.getByRole('radio', { name: /Afecta al establecimiento/ }))
    confirmarCategoria()
    fireEvent.click(screen.getByRole('radio', { name: 'Sin energía o agua' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Crítica' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Se prolonga en el tiempo o no tiene fecha de solución' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    continuar()
    completarAQuienAfecta()
    continuar()
    completarEstadoEstablecimiento()
    continuar()
    continuar()
    fireEvent.click(screen.getByRole('button', { name: /guardar situación/i }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const cuerpo = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    expect(cuerpo.afectacionesNuevas[0]).toMatchObject({ severidad: 'Crítica', justificacionCritica: 'se_prolonga' })
  })
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

    expect(screen.getByText('Paso 1 de 5')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '¿Qué pasó?' })).toBeInTheDocument()
  })

  it('envía rigeDesde resuelto al momento de enviar cuando se deja "Ahora"', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-10-04T18:00:00.000Z'))
    const fetchMock = stubFetch()
    renderFormulario()
    llegarAConfirmar()
    vi.setSystemTime(new Date('2026-10-04T18:10:00.000Z'))
    fireEvent.click(screen.getByRole('button', { name: /guardar situación/i }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(init.body as string).rigeDesde).toBe('2026-10-04T18:10:00.000Z')
    vi.useRealTimers()
  })

  it('adapta la pregunta de vigencia a la categoría', () => {
    renderFormulario()
    fireEvent.click(screen.getByRole('radio', { name: /Inaccesibilidad de alumnos/ }))
    confirmarCategoria()
    fireEvent.click(screen.getByRole('radio', { name: 'Anegamiento' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Alta' }))
    continuar()
    completarAQuienAfecta('alumnos')
    continuar()
    expect(screen.getByRole('heading', { name: '¿Desde cuándo?' })).toBeInTheDocument()
    expect(screen.getByText('¿Desde cuándo no pueden llegar?')).toBeInTheDocument()

    cleanup()
    renderFormulario()
    completarQuePaso()
    continuar()
    completarAQuienAfecta()
    continuar()
    completarEstadoEstablecimiento()
    continuar()
    expect(screen.getByRole('heading', { name: '¿Desde cuándo?' })).toBeInTheDocument()
    expect(screen.getByText('¿Desde cuándo ocurre?')).toBeInTheDocument()
  })

  // Motivo y severidad ya no son <select>: con 3 a 5 opciones el desplegable
  // cuesta tres gestos y tapa la pantalla.
  it('ofrece motivo y severidad como opciones a la vista, no como desplegables', () => {
    renderFormulario()

    expect(screen.queryByRole('combobox')).toBeNull()

    fireEvent.click(screen.getByRole('radio', { name: /Afecta al establecimiento/ }))
    confirmarCategoria()

    expect(screen.getByRole('radio', { name: 'Inundación' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Tormenta severa' })).toBeInTheDocument()
    // El motivo de la otra categoría no se ofrece.
    expect(screen.queryByRole('radio', { name: 'Anegamiento' })).toBeNull()
    expect(screen.getByRole('radio', { name: 'Crítica' })).toBeInTheDocument()
  })

  it('muestra la glosa de cada categoría, que antes existía sin mostrarse', () => {
    renderFormulario()

    expect(screen.getByText('La escuela o parte de ella deja de funcionar con normalidad.')).toBeInTheDocument()
    expect(screen.getByText('La escuela funciona, pero hay alumnos que no pueden llegar.')).toBeInTheDocument()
  })

  it('no avanza del primer paso sin tipo, motivo y severidad, y dice qué falta', () => {
    renderFormulario()

    continuar()

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Elija el tipo de situación, el motivo y la gravedad para continuar.',
    )
    expect(screen.getByRole('heading', { name: '¿Qué pasó?' })).toBeInTheDocument()
  })

  it('limpia el mensaje del primer paso cuando completa tipo, motivo y severidad', () => {
    renderFormulario()
    continuar()
    expect(screen.getByRole('alert')).toHaveTextContent('Elija el tipo de situación')

    completarQuePaso()

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('no avanza del segundo paso sin secciones elegidas', () => {
    renderFormulario()

    completarQuePaso()
    continuar()
    expect(screen.getByRole('heading', { name: '¿A quiénes afecta?' })).toBeInTheDocument()

    continuar()

    expect(screen.getByRole('alert')).toHaveTextContent('Elija al menos una sección para esta situación.')
    expect(screen.getByRole('heading', { name: '¿A quiénes afecta?' })).toBeInTheDocument()
  })

  it('con motivo "Otro" exige la descripción para avanzar desde el segundo paso', () => {
    renderFormulario({
      motivos: [...motivos, { id: 'otro-establecimiento', nombre: 'Otro problema en el establecimiento', categoria: 'establecimiento', orden: 90, severidadSugerida: null }],
    })
    fireEvent.click(screen.getByRole('radio', { name: /Afecta al establecimiento/ }))
    confirmarCategoria()
    fireEvent.click(screen.getByRole('radio', { name: 'Otro problema en el establecimiento' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Alta' }))
    continuar()
    completarAQuienAfecta()
    expect(screen.getByLabelText('Descripción (obligatoria)')).toBeInTheDocument()

    continuar()

    expect(screen.getByRole('alert')).toHaveTextContent('Describa la situación: al elegir "Otro" la descripción es obligatoria.')
    expect(screen.getByRole('heading', { name: '¿A quiénes afecta?' })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Descripción (obligatoria)'), { target: { value: 'Pérdida de agua en el baño' } })
    continuar()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('¿Cómo está el edificio?')).toBeInTheDocument()
  })

  it('usa las secciones afectadas como alcance de la interrupción', () => {
    renderFormulario()

    completarQuePaso()
    continuar()
    completarAQuienAfecta()
    continuar()

    fireEvent.click(screen.getByRole('radio', { name: 'No, se suspendieron' }))
    expect(screen.queryByText('¿Dónde se interrumpió el funcionamiento?')).toBeNull()
    continuar()
    expect(screen.getByRole('alert')).toHaveTextContent('Indique cómo está el edificio.')

    completarEstadoEstablecimiento()
    continuar()
    expect(screen.getByRole('heading', { name: '¿Desde cuándo?' })).toBeInTheDocument()
    continuar()
    expect(screen.getByRole('heading', { name: 'Confirmar' })).toBeInTheDocument()
  })

  it('muestra todos los datos faltantes del tercer paso a la vez', () => {
    renderFormulario()

    completarQuePaso()
    continuar()
    completarAQuienAfecta()
    continuar()
    expect(screen.getByRole('heading', { name: 'Clases y edificio' })).toBeInTheDocument()

    continuar()

    expect(textoAlertas()).toContain('Indique si hay clases.')
    expect(textoAlertas()).toContain('Indique cómo está el edificio.')
    expect(screen.getByRole('heading', { name: 'Clases y edificio' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: 'No, se suspendieron' }))
    continuar()
    expect(screen.getByRole('alert')).toHaveTextContent('Indique cómo está el edificio.')
    completarEstadoEstablecimiento()
    continuar()

    expect(screen.getByRole('heading', { name: '¿Desde cuándo?' })).toBeInTheDocument()
  })

  it('el paso 3 pregunta clases, edificio y asistencia, y ya no pregunta desde cuándo', () => {
    renderFormulario()
    completarQuePaso()
    continuar()
    completarAQuienAfecta()
    continuar()

    expect(screen.getByText('Paso 3 de 5')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Clases y edificio' })).toBeInTheDocument()
    expect(screen.getByText('¿Se brinda asistencia pedagógica?')).toBeInTheDocument()
    expect(screen.queryByText('¿Desde cuándo ocurre?')).toBeNull()
    expect(screen.queryByRole('radio', { name: 'Ahora' })).toBeNull()
  })

  it('el paso 4 pregunta desde cuándo, con chips, y lleva a confirmar', () => {
    renderFormulario()
    completarQuePaso()
    continuar()
    completarAQuienAfecta()
    continuar()
    completarEstadoEstablecimiento()
    continuar()

    expect(screen.getByText('Paso 4 de 5')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '¿Desde cuándo?' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Ahora' })).toBeChecked()
    expect(screen.queryByText('¿Se brinda asistencia pedagógica?')).toBeNull()
    expect(screen.queryByRole('radio', { name: 'No, se suspendieron' })).toBeNull()

    continuar()
    expect(screen.getByText('Paso 5 de 5')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Confirmar' })).toBeInTheDocument()
  })

  it('una hora futura se marca en el paso 4 y el paso 3 sólo valida clases y edificio', () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-10-04T18:00:00.000Z'))
    renderFormulario()
    completarQuePaso()
    continuar()
    completarAQuienAfecta()
    continuar()

    continuar()
    expect(textoAlertas()).toContain('Indique si hay clases.')
    expect(textoAlertas()).toContain('Indique cómo está el edificio.')
    expect(textoAlertas()).not.toContain('Esa hora todavía no pasó.')

    completarEstadoEstablecimiento()
    continuar()
    fireEvent.click(screen.getByRole('radio', { name: 'Hoy, más temprano' }))
    fireEvent.change(screen.getByLabelText('Hora'), { target: { value: '23:59' } })
    continuar()

    expect(screen.getByRole('heading', { name: '¿Desde cuándo?' })).toBeInTheDocument()
    expect(textoAlertas()).toContain('Esa hora todavía no pasó.')
    expect(textoAlertas()).not.toContain('Indique si hay clases.')
    expect(screen.queryByText('Desde hoy a las 23:59')).not.toBeInTheDocument()
    vi.useRealTimers()
  })

  it('enfoca y desplaza la fecha futura al mostrar su error', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-10-04T18:00:00.000Z'))
    renderFormulario()
    expect(document.querySelector('.reporte-inicial')).toHaveClass('reporte-inicial--asistente')
    completarQuePaso()
    continuar()
    completarAQuienAfecta()
    continuar()
    completarEstadoEstablecimiento()
    continuar()
    fireEvent.click(screen.getByRole('radio', { name: 'Otro día' }))
    const fecha = screen.getByLabelText('Fecha') as HTMLInputElement
    const elementosDesplazados: Element[] = []
    const descriptorScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView')
    const scrollIntoView = vi.fn(function (this: HTMLElement) {
      elementosDesplazados.push(this)
    })
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView })
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    fireEvent.change(fecha, { target: { value: '2026-10-06' } })
    fireEvent.change(screen.getByLabelText('Hora'), { target: { value: '10:00' } })

    try {
      continuar()

      const mensaje = await screen.findByRole('alert')
      expect(mensaje).toHaveTextContent('La fecha no puede ser posterior a hoy.')
      expect(fecha).toHaveFocus()
      expect(elementosDesplazados).toContain(mensaje)
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'end' })

      fireEvent.change(fecha, { target: { value: '2025-10-03' } })
      continuar()
      expect(await screen.findByRole('alert')).toHaveTextContent('La fecha no puede ser anterior a hace 12 meses.')
    } finally {
      if (descriptorScroll) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', descriptorScroll)
      else delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView
      vi.useRealTimers()
    }
  })

  it('muestra las modalidades de asistencia en un subgrupo sólo al elegir Sí', () => {
    renderFormulario()
    completarQuePaso()
    continuar()
    completarAQuienAfecta()
    continuar()

    fireEvent.click(screen.getByRole('radio', { name: 'No' }))
    expect(screen.queryByRole('group', { name: '¿De qué forma?' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: 'Sí' }))
    const modalidades = screen.getByRole('group', { name: '¿De qué forma?' })
    expect(within(modalidades).getByRole('checkbox', { name: 'Clase virtual' })).toBeInTheDocument()
    expect(within(modalidades).getByRole('checkbox', { name: 'Cuadernillo' })).toBeInTheDocument()
  })

  it('usa etiquetas de alcance y una confirmación sin repetir el título', async () => {
    stubFetch()
    renderFormulario()
    completarQuePaso()
    continuar()
    completarAQuienAfecta()

    expect(screen.getByRole('heading', { name: '¿A quiénes afecta?' })).toBeInTheDocument()
    expect(document.querySelector('.afectacion-campos__legend.sr-only')).toHaveTextContent('¿A quiénes afecta?')
    expect(screen.queryByText('Alcance')).not.toBeInTheDocument()

    continuar()
    completarEstadoEstablecimiento()
    continuar()
    continuar()
    fireEvent.click(screen.getByRole('button', { name: /guardar situación/i }))
    await screen.findByText(MENSAJE_REPORTE_EXITOSO)
  })

  it('un problema de alumnos salta clases y edificio y numera sus pasos de 1 a 4', () => {
    renderFormulario()

    fireEvent.click(screen.getByRole('radio', { name: /Inaccesibilidad de alumnos/ }))
    confirmarCategoria()
    fireEvent.click(screen.getByRole('radio', { name: 'Anegamiento' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Alta' }))
    expect(screen.getByText('Paso 1 de 4')).toBeInTheDocument()
    continuar()
    expect(screen.getByText('Paso 2 de 4')).toBeInTheDocument()
    // El paso 2 de alumnos ya no incluye "desde cuándo".
    expect(screen.queryByText('¿Desde cuándo no pueden llegar?')).toBeNull()
    completarAQuienAfecta('alumnos')
    continuar()

    expect(screen.getByText('Paso 3 de 4')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '¿Desde cuándo?' })).toBeInTheDocument()
    expect(screen.getByText('¿Desde cuándo no pueden llegar?')).toBeInTheDocument()
    expect(screen.queryByText('¿Cómo está el edificio?')).toBeNull()
    expect(screen.queryByText('No, se suspendieron')).toBeNull()
    continuar()

    expect(screen.getByText('Paso 4 de 4')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Confirmar' })).toBeInTheDocument()
  })

  it('al recomendar cambiar a establecimiento vuelve al paso 1 para elegir el motivo', () => {
    const turnosConMayoria = turnos.map((turno) => ({
      ...turno,
      niveles: turno.niveles.map((nivel) => ({
        ...nivel,
        secciones: nivel.secciones.map((seccion) => ({
          ...seccion,
          matricula: seccion.geSectionId === 10 ? 2 : 0,
        })),
      })),
    }))
    renderFormulario({ turnos: turnosConMayoria })

    fireEvent.click(screen.getByRole('radio', { name: /Inaccesibilidad de alumnos/ }))
    confirmarCategoria()
    fireEvent.click(screen.getByRole('radio', { name: 'Anegamiento' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Alta' }))
    continuar()
    const seccion = turnosConMayoria[0].niveles[0].secciones[0]
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`${seccion.curso} "${seccion.division}"`) }))
    for (const alumno of seccion.alumnos) {
      fireEvent.click(screen.getByRole('checkbox', { name: `${alumno.apellido}, ${alumno.nombre}` }))
    }
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar a establecimiento' }))

    expect(screen.getByRole('heading', { name: '¿Qué pasó?' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Elija el motivo de la situación del establecimiento.')
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
    const resumen = resumenConfirmacion()
    expect(within(resumen).getByText('Situación')).toBeInTheDocument()
    expect(within(resumen).getAllByRole('definition')[0]).toHaveTextContent(/Inundación.*Alta/)
    expect(within(resumen).getByText('Afecta a')).toBeInTheDocument()
    expect(within(resumen).getByText('1 sección · 28 alumnos')).toBeInTheDocument()
    expect(within(resumen).queryByRole('list')).not.toBeInTheDocument()
  })

  // Se acabó el botón gris sin explicación: llegar al paso 4 ya exige los
  // datos obligatorios, así que guardar siempre está habilitado.
  it('el botón de guardar sólo existe en el último paso y llega habilitado', () => {
    renderFormulario()

    expect(screen.queryByRole('button', { name: /guardar situación/i })).toBeNull()

    llegarAConfirmar()

    expect(screen.getByRole('button', { name: /guardar situación/i })).toBeEnabled()
  })

  /*
    Regresión de un bug encontrado en el navegador, no en jsdom: React
    reconciliaba "Continuar" y "guardar situación" como el MISMO nodo del DOM y
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
    const fetchMock = stubFetch()

    const { container } = renderFormulario()

    completarQuePaso()
    continuar()
    completarAQuienAfecta()
    continuar()

    completarEstadoEstablecimiento()
    continuar()
    const continuarEnPaso4 = screen.getByRole('button', { name: 'Continuar' })
    expect(container.querySelectorAll('button[type="submit"]')).toHaveLength(0)

    continuar()

    const guardar = screen.getByRole('button', { name: /guardar situación/i })
    expect(guardar).not.toBe(continuarEnPaso4)
    expect(continuarEnPaso4.isConnected).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('al guardar hace POST a /api/problematicas/parte con una sola afectación', async () => {
    const fetchMock = stubFetch()

    renderFormulario()
    guardarReporte()

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

  it('envía el vínculo de verificación y lo limpia solo después del éxito confirmado', async () => {
    sessionStorage.setItem(CLAVE_VINCULO_VERIFICACION, JSON.stringify({ id: 'v1', token: 't1' }))
    const fetchMock = stubFetch()
    renderFormulario()
    guardarReporte()

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(String(init.body)).verificacion).toEqual({ id: 'v1', token: 't1' })
    await waitFor(() => expect(sessionStorage.getItem(CLAVE_VINCULO_VERIFICACION)).toBeNull())
  })

  it('omite el vínculo cuando no existe y lo conserva ante una respuesta fallida', async () => {
    const fetchMock = stubFetch()
    renderFormulario({ cue: '12345679' })
    guardarReporte()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(String(init.body))).not.toHaveProperty('verificacion')

    cleanup()
    sessionStorage.setItem(CLAVE_VINCULO_VERIFICACION, JSON.stringify({ id: 'v1', token: 't1' }))
    const fetchFallido = stubFetch({ error: 'boom' }, 422)
    renderFormulario()
    guardarReporte()
    await screen.findByText('No se pudo enviar: boom')
    const [, initFallido] = fetchFallido.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(String(initFallido.body)).verificacion).toEqual({ id: 'v1', token: 't1' })
    expect(sessionStorage.getItem(CLAVE_VINCULO_VERIFICACION)).not.toBeNull()
  })

  it('una respuesta exitosa reemplaza el asistente por la confirmación del reporte', async () => {
    stubFetch({
      ok: true,
      parteId: 'p1',
      movimientoId: 'm1',
      tipo: 'reporte_inicial',
      cambios: [],
    })

    renderFormulario()
    guardarReporte()

    // El texto habla del reporte, no de "la actualización": esta pantalla es
    // el primer reporte y no hay nada previo que actualizar.
    expect(
      await screen.findByText(
        MENSAJE_REPORTE_EXITOSO,
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /guardar situación/i })).toBeNull()
  })

  // El reporte guardado no puede dejar al director en un callejón sin salida:
  // necesita una forma de volver y una de declarar un hecho distinto.
  it('la confirmación ofrece volver al panel o cargar otra situación', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    stubFetch()

    try {
      renderFormulario()
      guardarReporte()

      await screen.findByText(MENSAJE_REPORTE_EXITOSO)
      expect(document.querySelector('.reporte-inicial__confirmacion-mensaje svg')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Situación guardada' })).toBeInTheDocument()

      const volverAlPanel = screen.getByRole('link', { name: 'Ver estado actual' })
      expect(volverAlPanel.tagName).toBe('A')
      expect(volverAlPanel).toHaveAttribute('href', `/problematicas/parte?cue=${props.cue}`)
      expect(consoleError).not.toHaveBeenCalled()

      // No hay redirección automática: el mensaje y las acciones siguen ahí.
      expect(screen.getByText(MENSAJE_REPORTE_EXITOSO)).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Cargar otra situación' }))

      expect(screen.getByText('Paso 1 de 5')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: '¿Qué pasó?' })).toBeInTheDocument()
      // La categoría ya no está elegida, así que ni siquiera se ofrecen motivos.
      expect(screen.getByRole('radio', { name: /Afecta al establecimiento/ })).not.toBeChecked()
      expect(screen.queryByRole('radio', { name: 'Inundación' })).toBeNull()
    } finally {
      consoleError.mockRestore()
    }
  })

  it('una respuesta fallida muestra el error del servidor y conserva lo ingresado', async () => {
    stubFetch({ error: 'boom' }, 422)

    renderFormulario()
    guardarReporte()

    expect(await screen.findByText('No se pudo enviar: boom')).toBeInTheDocument()
    expect(resumenConfirmacion()).toHaveTextContent(/Inundación.*Alta/)
    expect(screen.getByRole('button', { name: /guardar situación/i })).toBeEnabled()
  })

  it('un error de red deja el envío pendiente y conserva lo ingresado', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('network')
    })
    stubFetchMock(fetchMock)

    renderFormulario()

    guardarReporte()

    expect(await screen.findByText(MENSAJES_ESTADO['pendiente-envio'])).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(MENSAJES_ESTADO['pendiente-envio'])
    expect(screen.getByRole('button', { name: 'Envío pendiente' })).toBeDisabled()
    expect(resumenConfirmacion()).toHaveTextContent(/Inundación.*Alta/)
  })

  it('un timeout se reintenta solo con la misma clave y conserva el aviso durante el reintento', async () => {
    vi.useFakeTimers()
    let intentos = 0
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      intentos += 1
      if (intentos === 3) return Promise.resolve(jsonResponse({ ok: true, movimientoId: 'm2' }, 201))
      return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      })
    })
    stubFetchMock(fetchMock)

    renderFormulario()
    llegarAConfirmar()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar situación' }))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    await act(async () => { await vi.advanceTimersByTimeAsync(15000) })
    expect(screen.getByRole('alert')).toHaveTextContent('El servidor no respondió. Reintentamos solos; su parte queda guardado.')

    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reintentando…' })).toBeDisabled()
    const retry = within(screen.getByRole('alert')).getByRole('button', { name: 'Reintentar ahora' })
    expect(retry).toBeEnabled()
    expect(screen.getAllByRole('button', { name: 'Reintentar ahora' })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Guardar situación' })).toBeNull()
    fireEvent.click(retry)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
    await vi.waitFor(() => expect(screen.getByText(MENSAJE_REPORTE_EXITOSO)).toBeInTheDocument())
    expect((fetchMock.mock.calls[1][1] as RequestInit).signal?.aborted).toBe(true)
    const claves = fetchMock.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)).idempotencyKey)
    expect(claves[1]).toBe(claves[0]); expect(claves[2]).toBe(claves[0])
  })

  it('si el guardado local falla, sale de Guardando… y muestra un error', async () => {
    stubFetch()
    renderFormulario()
    llegarAConfirmar()
    // A rejecting lock stands in for any local-storage failure on the save path.
    Object.defineProperty(navigator, 'locks', {
      value: { request: (nombre: string, tarea: () => unknown) => nombre.startsWith('parte-offline:decidir') ? Promise.reject(new DOMException('closed', 'InvalidStateError')) : Promise.resolve().then(tarea) },
      configurable: true,
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar situación' }))
    expect(await screen.findByRole('button', { name: 'Guardar situación', hidden: true })).toBeEnabled()
    Reflect.deleteProperty(navigator, 'locks')
    expect(textoAlertas()).toContain('No pudimos guardar')
  })

  it('muestra Guardando… sin texto duplicado y permite volver mientras se envía', async () => {
    let resolver!: (respuesta: Response) => void
    stubFetchMock(vi.fn(() => new Promise<Response>((resolve) => { resolver = resolve })))

    renderFormulario()

    guardarReporte()

    expect(await screen.findByRole('button', { name: 'Guardando…' })).toBeInTheDocument()
    expect(screen.queryByText('Enviando…')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Volver' })).toBeEnabled()
    await waitFor(() => expect(resolver).toEqual(expect.any(Function)))
    resolver(jsonResponse({ ok: true, movimientoId: 'm1' }, 201))
    await screen.findByText(MENSAJE_REPORTE_EXITOSO)
  })

  it('un 5xx muestra error del servidor (no de conexión) y se reintenta solo, con un único parte', async () => {
    const fetchMock = vi.fn()
    fetchMock
      .mockImplementationOnce(async () => jsonResponse({ error: 'boom' }, 503))
      .mockImplementationOnce(async () => jsonResponse({ ok: true, movimientoId: 'm1' }, 201))
    stubFetchMock(fetchMock)

    renderFormulario()
    guardarReporte()

    const aviso = await screen.findByRole('alert')
    expect(within(aviso).getByText(MENSAJES_ESTADO['error-servidor'])).toBeInTheDocument()
    expect(within(aviso).getByRole('button', { name: 'Reintentar ahora' })).toBeInTheDocument()
    const botonGuardar = document.querySelector('.asistente__acciones button:last-child') as HTMLElement
    expect(aviso.compareDocumentPosition(botonGuardar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByText(/sin conexión/i)).not.toBeInTheDocument()

    // Sin evento 'online': el temporizador dispara el reintento con backoff.
    await screen.findByText(MENSAJE_REPORTE_EXITOSO, undefined, { timeout: 5000 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [, initA] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const [, initB] = fetchMock.mock.calls[1] as unknown as [string, RequestInit]
    const cuerpoA = JSON.parse(initA.body as string) as { idempotencyKey: string }
    const cuerpoB = JSON.parse(initB.body as string) as { idempotencyKey: string }
    expect(cuerpoA.idempotencyKey).toBe(cuerpoB.idempotencyKey)
  })

  it('el aviso de error permite reintentar de inmediato', async () => {
    const fetchMock = vi.fn()
    fetchMock
      .mockImplementationOnce(async () => jsonResponse({ error: 'boom' }, 503))
      .mockImplementationOnce(async () => jsonResponse({ ok: true, movimientoId: 'm1' }, 201))
    stubFetchMock(fetchMock)

    renderFormulario()
    guardarReporte()

    const aviso = await screen.findByRole('alert')
    expect(within(aviso).getByText(MENSAJES_ESTADO['error-servidor'])).toBeInTheDocument()
    fireEvent.click(within(aviso).getByRole('button', { name: 'Reintentar ahora' }))
    expect(await screen.findByText(MENSAJE_REPORTE_EXITOSO)).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  // Hallazgo de revisión #2 (gate N1): un 2xx con un cuerpo que no cumple el
  // contrato esperado (sin `movimientoId`) no puede tratarse como éxito.
  it('un 2xx con cuerpo inesperado NO confirma el reporte y conserva el borrador con la misma clave', async () => {
    const fetchMock = vi.fn()
    fetchMock
      .mockImplementationOnce(async () => jsonResponse({ algo: 'inesperado' }, 200))
      .mockImplementationOnce(async () => jsonResponse({ ok: true, movimientoId: 'm1' }, 201))
    stubFetchMock(fetchMock)

    renderFormulario()
    guardarReporte()

    expect(
      await screen.findByText('No se pudo enviar: respuesta inesperada del servidor'),
    ).toBeInTheDocument()
    // No confirmó nada: el asistente sigue en pie con lo cargado.
    expect(resumenConfirmacion()).toHaveTextContent(/Inundación.*Alta/)
    expect(screen.getByRole('button', { name: /guardar situación/i })).toBeEnabled()

    // Un reintento manual reutiliza la MISMA idempotencyKey: el cuerpo
    // inesperado no hizo que se acuñara una nueva.
    fireEvent.click(screen.getByRole('button', { name: /guardar situación/i }))
    await screen.findByText(
      MENSAJE_REPORTE_EXITOSO,
    )
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [, initA] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const [, initB] = fetchMock.mock.calls[1] as unknown as [string, RequestInit]
    const cuerpoA = JSON.parse(initA.body as string) as { idempotencyKey: string }
    const cuerpoB = JSON.parse(initB.body as string) as { idempotencyKey: string }
    expect(cuerpoA.idempotencyKey).toBe(cuerpoB.idempotencyKey)
  })

  it('un 422 no se reintenta: muestra el error y el borrador queda editable', async () => {
    const fetchMock = stubFetch({ error: 'dato inválido' }, 422)

    renderFormulario()
    guardarReporte()

    expect(await screen.findByText('No se pudo enviar: dato inválido')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: /guardar situación/i })).toBeEnabled()
  })

  it('una sesión vencida (401) muestra una alerta y permite reintentar manualmente', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({}, 401))
      .mockResolvedValueOnce(jsonResponse({ ok: true, movimientoId: 'm1' }, 201))
    stubFetchMock(fetchMock)

    renderFormulario()
    guardarReporte()

    const aviso = await screen.findByRole('alert')
    expect(within(aviso).getByText('La sesión venció. Vuelva a ingresar con el enlace de su escuela; lo cargado se conserva.')).toBeInTheDocument()
    expect(within(aviso).getByRole('button', { name: 'Reintentar ahora' })).toBeInTheDocument()
    expect(resumenConfirmacion()).toHaveTextContent(/Inundación.*Alta/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    fireEvent.click(within(aviso).getByRole('button', { name: 'Reintentar ahora' }))
    expect(await screen.findByText(MENSAJE_REPORTE_EXITOSO)).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('ReporteInicialForm — borrador persistente (#32) e historial del navegador (#31)', () => {
  const clave = `parte-nuevo:draft:${props.cue}`

  it('guarda el borrador con su paso y ofrece retomarlo al remontar (#32)', async () => {
    expect(MENSAJE_BORRADOR_PENDIENTE).toBe('Tiene un parte sin enviar.')
    const primero = renderFormulario()
    completarQuePaso()
    continuar()

    expect(screen.getByText('Paso 2 de 5')).toBeInTheDocument()
    await waitFor(() => expect(localStorage.getItem(clave)).not.toBeNull())

    // Recarga simulada: el asistente vuelve a montar con el mismo storage.
    primero.unmount()
    renderFormulario()

    expect(await screen.findByText(MENSAJE_BORRADOR_PENDIENTE)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '¿Qué pasó?' })).not.toBeInTheDocument()
    const aviso = screen.getByRole('dialog', { name: MENSAJE_BORRADOR_PENDIENTE })
    const continuarBorrador = within(aviso).getByRole('button', { name: 'Continuar donde lo dejé' })
    expect(within(aviso).getByRole('button', { name: 'Descartar' })).toBeInTheDocument()
    fireEvent.click(continuarBorrador)
    expect(screen.getByText('Paso 2 de 5')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '¿A quiénes afecta?' })).toBeInTheDocument()
    // Los datos del paso 1 también vuelven: "Volver" los muestra intactos.
    volver()
    expect(screen.getByText('Paso 1 de 5')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Inundación' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Alta' })).toBeChecked()
  })

  it('al volver con un borrador sin enviar ofrece continuar o descartar', async () => {
    const cue = '12345679'
    sembrarBorradorWizard({ paso: 2, cue })
    renderFormulario({ cue })

    expect(await screen.findByText(MENSAJE_BORRADOR_PENDIENTE)).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Continuar donde lo dejé' }))
    })
    expect(await screen.findByText('Paso 2 de 4')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '¿A quiénes afecta?' })).toBeInTheDocument()
  })

  it('restaura un borrador de establecimiento sin motivo en el paso 1 y muestra el error', async () => {
    sembrarBorradorWizard({ paso: 2, categoria: 'establecimiento', motivo: '' })
    renderFormulario()

    fireEvent.click(await screen.findByRole('button', { name: 'Continuar donde lo dejé' }))

    expect(screen.getByText('Paso 1 de 5')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '¿Qué pasó?' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Elija el motivo de la situación del establecimiento.')
  })

  it('descartar pide confirmación y arranca de cero', async () => {
    sembrarBorradorWizard({ paso: 2 })
    renderFormulario()
    fireEvent.click(await screen.findByRole('button', { name: 'Descartar' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sí, descartar' }))

    await waitFor(() => expect(screen.queryByText(MENSAJE_BORRADOR_PENDIENTE)).not.toBeInTheDocument())
    expect(await screen.findByRole('heading', { name: '¿Qué pasó?' })).toBeInTheDocument()
    expect(localStorage.getItem(`parte-nuevo:draft:${props.cue}`)).toBeNull()
  })

  it('un borrador viejo sin los campos nuevos se restaura con valores por defecto', async () => {
    sembrarBorradorWizard({ paso: 4, version: 2, sinCamposNuevos: true })
    renderFormulario()
    fireEvent.click(await screen.findByRole('button', { name: 'Continuar donde lo dejé' }))

    expect(await screen.findByRole('radio', { name: 'Ahora' })).toBeChecked()
  })

  it('guarda el borrador con la versión de numeración vigente', async () => {
    renderFormulario()
    completarQuePaso()
    continuar()

    await waitFor(() => expect(localStorage.getItem(clave)).not.toBeNull())
    expect(JSON.parse(localStorage.getItem(clave) as string).version).toBe(2)
  })

  describe('migración de borradores con la numeración anterior (paso 3 dividido)', () => {
    async function restaurar() {
      renderFormulario()
      fireEvent.click(await screen.findByRole('button', { name: 'Continuar donde lo dejé' }))
    }

    it('establecimiento: el paso 3 viejo (clases, edificio y desde cuándo) queda en el paso 3 nuevo', async () => {
      sembrarBorradorWizard({ paso: 3, categoria: 'establecimiento' })
      await restaurar()

      expect(screen.getByText('Paso 3 de 5')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Clases y edificio' })).toBeInTheDocument()
    })

    it('establecimiento: el paso 4 viejo (Confirmar) pasa al paso 5 nuevo', async () => {
      sembrarBorradorWizard({ paso: 4, categoria: 'establecimiento' })
      await restaurar()

      expect(screen.getByText('Paso 5 de 5')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Confirmar' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /guardar situación/i })).toBeInTheDocument()
    })

    it('alumnos: el paso 4 viejo (Confirmar) pasa al paso 5 nuevo, que es el 4 de 4', async () => {
      sembrarBorradorWizard({ paso: 4, categoria: 'alumnos' })
      await restaurar()

      expect(screen.getByText('Paso 4 de 4')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Confirmar' })).toBeInTheDocument()
    })

    it('alumnos: el paso 2 viejo sigue siendo el paso 2, y desde cuándo viene después', async () => {
      sembrarBorradorWizard({ paso: 2, categoria: 'alumnos' })
      await restaurar()

      expect(screen.getByText('Paso 2 de 4')).toBeInTheDocument()
      expect(screen.queryByText('¿Desde cuándo no pueden llegar?')).toBeNull()
    })

    it('un borrador nuevo (versión 2) en el paso 4 es "¿Desde cuándo?", no Confirmar', async () => {
      sembrarBorradorWizard({ paso: 4, version: 2, categoria: 'establecimiento' })
      await restaurar()

      expect(screen.getByText('Paso 4 de 5')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: '¿Desde cuándo?' })).toBeInTheDocument()
    })

    it('un borrador nuevo de alumnos en el paso 4 es el 3 de 4', async () => {
      sembrarBorradorWizard({ paso: 4, version: 2, categoria: 'alumnos' })
      await restaurar()

      expect(screen.getByText('Paso 3 de 4')).toBeInTheDocument()
      expect(screen.getByText('¿Desde cuándo no pueden llegar?')).toBeInTheDocument()
    })

    it('el historial del navegador de una sesión vieja en Confirmar sigue el paso migrado', async () => {
      window.history.replaceState({ partePaso: 4, parteGeneracion: 'generacion-test' }, '')
      sembrarBorradorWizard({ paso: 4, categoria: 'establecimiento' })
      await restaurar()
      expect(screen.getByText('Paso 5 de 5')).toBeInTheDocument()

      // "Atrás" del navegador camina a un paso real, sin saltarse ninguno.
      fireEvent(window, new PopStateEvent('popstate'))
      expect(screen.getByText('Paso 4 de 5')).toBeInTheDocument()
      window.history.replaceState(null, '')
    })
  })

  it('el borrador queda claveado por CUE: otro establecimiento no lo hereda', () => {
    const primero = renderFormulario({ cue: '11111111' })
    completarQuePaso()
    continuar()
    primero.unmount()

    renderFormulario({ cue: '22222222' })
    expect(screen.getByText('Paso 1 de 5')).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'Inundación' })).toBeNull()
  })

  it('un popstate retrocede exactamente un paso y conserva lo cargado (#31)', () => {
    renderFormulario()
    completarQuePaso()
    continuar()
    completarAQuienAfecta()
    continuar()
    expect(screen.getByText('Paso 3 de 5')).toBeInTheDocument()

    fireEvent(window, new PopStateEvent('popstate'))
    expect(screen.getByText('Paso 2 de 5')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '¿A quiénes afecta?' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /1° "A"/ })).toBeChecked()

    fireEvent(window, new PopStateEvent('popstate'))
    expect(screen.getByText('Paso 1 de 5')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Inundación' })).toBeChecked()

    // Desde el primer paso el asistente no se pierde: el paso se mantiene.
    fireEvent(window, new PopStateEvent('popstate'))
    expect(screen.getByText('Paso 1 de 5')).toBeInTheDocument()
  })

  it('un guardado exitoso limpia la clave del borrador', async () => {
    stubFetch()

    renderFormulario()
    guardarReporte()

    await screen.findByText(MENSAJE_REPORTE_EXITOSO)
    await waitFor(() => expect(localStorage.getItem(clave)).toBeNull())
  })

  it('"Cargar otra situación" limpia el borrador y no lo vuelve a escribir', async () => {
    stubFetch()

    renderFormulario()
    guardarReporte()
    await screen.findByText(MENSAJE_REPORTE_EXITOSO)

    fireEvent.click(screen.getByRole('button', { name: 'Cargar otra situación' }))

    expect(screen.getByText('Paso 1 de 5')).toBeInTheDocument()
    await waitFor(() => expect(localStorage.getItem(clave)).toBeNull())
  })
})

describe('ReporteInicialForm — envío pendiente restaurado de la cola offline', () => {
  /*
    Si la app se cierra con un envío en cola, al reabrirla debe reenviarlo sin
    esperar un evento de conexión ni una acción del director.
  */
  it('al montar con una cola pendiente y conexión disponible, la reenvía sin intervención', async () => {
    const almacen = await crearAlmacenParte()
    await guardarBorradorEnvio(almacen, {
      tipo: 'nuevo',
      cue: props.cue,
      idempotencyKey: 'k-vieja',
      datos: { cue: props.cue, rigeDesde: '2026-10-04T10:00:00.000Z', afectacionesNuevas: [] },
      estado: 'pendiente-envio',
      intentos: 1,
      actualizadoEn: '2026-10-04T10:00:00.000Z',
    })
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true, movimientoId: 'm1' }, 201))
    stubFetchMock(fetchMock)

    renderFormulario()

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), { timeout: 5000 })
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(init.body as string).idempotencyKey).toBe('k-vieja')
    await waitFor(() => expect(screen.queryByText(/sin conexión/i)).not.toBeInTheDocument())
  })

  it('al reabrir con una cola de timeout, la reintenta sin intervención', async () => {
    const almacen = await crearAlmacenParte()
    await guardarBorradorEnvio(almacen, {
      tipo: 'nuevo',
      cue: props.cue,
      idempotencyKey: 'k-timeout',
      datos: { cue: props.cue, rigeDesde: '2026-10-04T10:00:00.000Z', afectacionesNuevas: [] },
      estado: 'error-servidor',
      motivoError: 'El servidor no respondió. Reintentamos solos; su parte queda guardado.',
      intentos: 1,
      actualizadoEn: '2026-10-04T10:00:00.000Z',
    })
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true, movimientoId: 'm1' }, 201))
    stubFetchMock(fetchMock)

    renderFormulario()

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), { timeout: 5000 })
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(init.body as string).idempotencyKey).toBe('k-timeout')
  })
})
