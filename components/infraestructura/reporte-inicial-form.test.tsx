// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReporteInicialForm } from './reporte-inicial-form'
import { jsonResponse } from '@/lib/infraestructura/test-utils/http'
import { motivos, turnos } from '@/components/test-utils/parte-formulario'
import { CLAVE_VINCULO_VERIFICACION } from './verificacion-vinculo'
import { MENSAJES_ESTADO, crearAlmacenNavegador, guardarBorrador as guardarBorradorEnvio } from '@/lib/infraestructura/parte/envio-offline'

const props = { cue: '12345678', turnos, motivos }

const MENSAJE_REPORTE_EXITOSO =
  'El reporte fue registrado. El estado actual y el historial ya reflejan lo informado.'

function renderFormulario(overrides: Partial<typeof props> = {}) {
  return render(<ReporteInicialForm {...props} {...overrides} />)
}

function stubFetch(respuesta: unknown = { ok: true, movimientoId: 'm1' }, status = 201) {
  const fetchMock = vi.fn(async () => jsonResponse(respuesta, status))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const continuar = () => fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
const volver = () => fireEvent.click(screen.getByRole('button', { name: 'Volver' }))
const confirmarCategoria = () =>
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Continuar' }))

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
  fireEvent.click(screen.getByRole('checkbox', { name: /1° "A"/ }))
}

/** Paso 3: cómo está el edificio (obligatorio). */
function completarEstadoEstablecimiento() {
  fireEvent.click(screen.getByRole('radio', { name: 'Funcionamiento habitual' }))
}

/** Deja el asistente en el paso 4, listo para guardar. */
function llegarAConfirmar() {
  completarQuePaso()
  continuar()
  completarAQuienAfecta()
  continuar()
  completarEstadoEstablecimiento()
  continuar()
}

function guardarReporte() {
  llegarAConfirmar()
  fireEvent.click(screen.getByRole('button', { name: /guardar reporte/i }))
}

beforeEach(() => {
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
  document.body.innerHTML = ''
})

describe('ReporteInicialForm', () => {
  it('advierte y exige confirmar la interrupción total al declarar secciones y evacuación', () => {
    renderFormulario()
    completarQuePaso()
    continuar()
    completarAQuienAfecta()
    continuar()
    fireEvent.click(screen.getByRole('radio', { name: 'Establecimiento evacuado' }))
    expect(screen.getByText(/solo algunas secciones.*interrupción de toda la escuela/i)).toBeVisible()
    continuar()
    expect(screen.getByRole('heading', { name: '¿Cómo sigue el servicio?' })).toBeVisible()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Confirmo que se interrumpe todo el establecimiento' }))
    continuar()
    expect(screen.getByRole('heading', { name: 'Confirmar' })).toBeVisible()
  })

  it('no pide confirmación al evacuar si se marcaron todas las secciones', () => {
    const unaSeccion = [{ ...turnos[0], niveles: [{ ...turnos[0].niveles[0], secciones: turnos[0].niveles[0].secciones.slice(0, 1) }] }]
    renderFormulario({ turnos: unaSeccion })
    completarQuePaso()
    continuar()
    fireEvent.click(screen.getAllByRole('checkbox')[0])
    continuar()
    fireEvent.click(screen.getByRole('radio', { name: 'Establecimiento evacuado' }))
    expect(screen.queryByText(/solo algunas secciones/i)).toBeNull()
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
    fireEvent.click(screen.getByRole('button', { name: /guardar reporte/i }))
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
    fireEvent.click(screen.getByRole('button', { name: /guardar reporte/i }))
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

    expect(screen.getByText('Paso 1 de 4')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '¿Qué pasó?' })).toBeInTheDocument()
  })

  it('envía rigeDesde resuelto al momento de enviar cuando se deja "Ahora"', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-10-04T18:00:00.000Z'))
    const fetchMock = stubFetch()
    renderFormulario()
    llegarAConfirmar()
    vi.setSystemTime(new Date('2026-10-04T18:10:00.000Z'))
    fireEvent.click(screen.getByRole('button', { name: /guardar reporte/i }))
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
    expect(screen.getByText('¿Desde cuándo no pueden llegar?')).toBeInTheDocument()

    cleanup()
    renderFormulario()
    completarQuePaso()
    continuar()
    completarAQuienAfecta()
    continuar()
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

  it('usa las secciones afectadas como alcance de la interrupción', () => {
    renderFormulario()

    completarQuePaso()
    continuar()
    completarAQuienAfecta()
    continuar()

    fireEvent.click(screen.getByRole('radio', { name: 'Funcionamiento escolar interrumpido' }))
    expect(screen.queryByText('¿Dónde se interrumpió el funcionamiento?')).toBeNull()
    continuar()
    expect(screen.getByRole('alert')).toHaveTextContent('Indique cómo está el edificio.')

    completarEstadoEstablecimiento()
    continuar()
    expect(screen.getByRole('heading', { name: 'Confirmar' })).toBeInTheDocument()
  })

  it('no avanza del tercer paso sin indicar cómo está el edificio', () => {
    renderFormulario()

    completarQuePaso()
    continuar()
    completarAQuienAfecta()
    continuar()
    expect(screen.getByRole('heading', { name: '¿Cómo sigue el servicio?' })).toBeInTheDocument()

    continuar()

    expect(screen.getByRole('alert')).toHaveTextContent('Indique cómo está el edificio.')
    expect(screen.getByRole('heading', { name: '¿Cómo sigue el servicio?' })).toBeInTheDocument()

    completarEstadoEstablecimiento()
    continuar()

    expect(screen.getByRole('heading', { name: 'Confirmar' })).toBeInTheDocument()
  })

  it('un problema de alumnos pasa directamente a confirmar sin preguntar por escuela ni edificio', () => {
    renderFormulario()

    fireEvent.click(screen.getByRole('radio', { name: /Inaccesibilidad de alumnos/ }))
    confirmarCategoria()
    fireEvent.click(screen.getByRole('radio', { name: 'Anegamiento' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Alta' }))
    continuar()
    completarAQuienAfecta('alumnos')
    continuar()

    expect(screen.getByText('Paso 3 de 3')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Confirmar' })).toBeInTheDocument()
    expect(screen.queryByText('¿Cómo está el edificio?')).toBeNull()
    expect(screen.queryByText('Funcionamiento escolar interrumpido')).toBeNull()
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
    expect(screen.getByRole('alert')).toHaveTextContent('Elija el motivo del problema del establecimiento.')
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
    const fetchMock = stubFetch()

    const { container } = renderFormulario()

    completarQuePaso()
    continuar()
    completarAQuienAfecta()
    continuar()

    const continuarEnPaso3 = screen.getByRole('button', { name: 'Continuar' })
    expect(container.querySelectorAll('button[type="submit"]')).toHaveLength(0)

    completarEstadoEstablecimiento()
    continuar()

    const guardar = screen.getByRole('button', { name: /guardar reporte/i })
    expect(guardar).not.toBe(continuarEnPaso3)
    expect(continuarEnPaso3.isConnected).toBe(false)
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
    renderFormulario()
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
    expect(screen.queryByRole('button', { name: /guardar reporte/i })).toBeNull()
  })

  // El reporte guardado no puede dejar al director en un callejón sin salida:
  // necesita una forma de volver y una de declarar un hecho distinto.
  it('la confirmación ofrece volver al panel y registrar otra incidencia', async () => {
    stubFetch()

    renderFormulario()
    guardarReporte()

    await screen.findByText(MENSAJE_REPORTE_EXITOSO)

    const volverAlPanel = screen.getByRole('link', { name: /volver al panel/i })
    expect(volverAlPanel).toHaveAttribute('href', `/problematicas/parte?cue=${props.cue}`)

    // No hay redirección automática: el mensaje y las acciones siguen ahí.
    expect(screen.getByText(MENSAJE_REPORTE_EXITOSO)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /registrar otra incidencia/i }))

    expect(screen.getByText('Paso 1 de 4')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '¿Qué pasó?' })).toBeInTheDocument()
    // La categoría ya no está elegida, así que ni siquiera se ofrecen motivos.
    expect(screen.getByRole('radio', { name: /Afecta al establecimiento/ })).not.toBeChecked()
    expect(screen.queryByRole('radio', { name: 'Inundación' })).toBeNull()
  })

  it('una respuesta fallida muestra el error del servidor y conserva lo ingresado', async () => {
    stubFetch({ error: 'boom' }, 422)

    renderFormulario()
    guardarReporte()

    expect(await screen.findByText('No se pudo enviar: boom')).toBeInTheDocument()
    expect(screen.getByText('Inundación · Severidad Alta')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /guardar reporte/i })).toBeEnabled()
  })

  it('un error de red deja el envío pendiente y conserva lo ingresado', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('network')
    })
    vi.stubGlobal('fetch', fetchMock)

    renderFormulario()

    guardarReporte()

    expect(
      await screen.findByText(MENSAJES_ESTADO['pendiente-envio']),
    ).toBeInTheDocument()
    expect(screen.getByText('Inundación · Severidad Alta')).toBeInTheDocument()
  })

  it('muestra Enviando… mientras se envía', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))

    renderFormulario()

    guardarReporte()

    expect(await screen.findByRole('status')).toHaveTextContent('Enviando…')
    expect(screen.getByRole('button', { name: /guardando/i })).toBeInTheDocument()
  })

  it('un 5xx muestra error del servidor (no de conexión) y se reintenta solo, con un único parte', async () => {
    const fetchMock = vi.fn()
    fetchMock
      .mockImplementationOnce(async () => jsonResponse({ error: 'boom' }, 503))
      .mockImplementationOnce(async () => jsonResponse({ ok: true, movimientoId: 'm1' }, 201))
    vi.stubGlobal('fetch', fetchMock)

    renderFormulario()
    guardarReporte()

    expect(await screen.findByText(MENSAJES_ESTADO['error-servidor'])).toBeInTheDocument()
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

  // Hallazgo de revisión #2 (gate N1): un 2xx con un cuerpo que no cumple el
  // contrato esperado (sin `movimientoId`) no puede tratarse como éxito.
  it('un 2xx con cuerpo inesperado NO confirma el reporte y conserva el borrador con la misma clave', async () => {
    const fetchMock = vi.fn()
    fetchMock
      .mockImplementationOnce(async () => jsonResponse({ algo: 'inesperado' }, 200))
      .mockImplementationOnce(async () => jsonResponse({ ok: true, movimientoId: 'm1' }, 201))
    vi.stubGlobal('fetch', fetchMock)

    renderFormulario()
    guardarReporte()

    expect(
      await screen.findByText('No se pudo enviar: respuesta inesperada del servidor'),
    ).toBeInTheDocument()
    // No confirmó nada: el asistente sigue en pie con lo cargado.
    expect(screen.getByText('Inundación · Severidad Alta')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /guardar reporte/i })).toBeEnabled()

    // Un reintento manual reutiliza la MISMA idempotencyKey: el cuerpo
    // inesperado no hizo que se acuñara una nueva.
    fireEvent.click(screen.getByRole('button', { name: /guardar reporte/i }))
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
    expect(screen.getByRole('button', { name: /guardar reporte/i })).toBeEnabled()
  })

  it('una sesión vencida (401) conserva el borrador y explica cómo retomar', async () => {
    stubFetch({}, 401)

    renderFormulario()
    guardarReporte()

    expect(await screen.findByText(/sesión/i)).toBeInTheDocument()
    expect(screen.getByText('Inundación · Severidad Alta')).toBeInTheDocument()
  })
})

describe('ReporteInicialForm — borrador persistente (#32) e historial del navegador (#31)', () => {
  const clave = `parte-nuevo:draft:${props.cue}`

  it('guarda el borrador con su paso y lo restaura al remontar (#32)', async () => {
    const primero = renderFormulario()
    completarQuePaso()
    continuar()

    expect(screen.getByText('Paso 2 de 4')).toBeInTheDocument()
    await waitFor(() => expect(localStorage.getItem(clave)).not.toBeNull())

    // Recarga simulada: el asistente vuelve a montar con el mismo storage.
    primero.unmount()
    renderFormulario()

    expect(await screen.findByText('Paso 2 de 4')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '¿A quiénes afecta?' })).toBeInTheDocument()
    // Los datos del paso 1 también vuelven: "Volver" los muestra intactos.
    volver()
    expect(screen.getByText('Paso 1 de 4')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Inundación' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Alta' })).toBeChecked()
  })

  it('el borrador queda claveado por CUE: otro establecimiento no lo hereda', () => {
    const primero = renderFormulario({ cue: '11111111' })
    completarQuePaso()
    continuar()
    primero.unmount()

    renderFormulario({ cue: '22222222' })
    expect(screen.getByText('Paso 1 de 4')).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'Inundación' })).toBeNull()
  })

  it('un popstate retrocede exactamente un paso y conserva lo cargado (#31)', () => {
    renderFormulario()
    completarQuePaso()
    continuar()
    completarAQuienAfecta()
    continuar()
    expect(screen.getByText('Paso 3 de 4')).toBeInTheDocument()

    fireEvent(window, new PopStateEvent('popstate'))
    expect(screen.getByText('Paso 2 de 4')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '¿A quiénes afecta?' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /1° "A"/ })).toBeChecked()

    fireEvent(window, new PopStateEvent('popstate'))
    expect(screen.getByText('Paso 1 de 4')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Inundación' })).toBeChecked()

    // Desde el primer paso el asistente no se pierde: el paso se mantiene.
    fireEvent(window, new PopStateEvent('popstate'))
    expect(screen.getByText('Paso 1 de 4')).toBeInTheDocument()
  })

  it('un guardado exitoso limpia la clave del borrador', async () => {
    stubFetch()

    renderFormulario()
    guardarReporte()

    await screen.findByText(MENSAJE_REPORTE_EXITOSO)
    await waitFor(() => expect(localStorage.getItem(clave)).toBeNull())
  })

  it('"Registrar otra incidencia" limpia el borrador y no lo vuelve a escribir', async () => {
    stubFetch()

    renderFormulario()
    guardarReporte()
    await screen.findByText(MENSAJE_REPORTE_EXITOSO)

    fireEvent.click(screen.getByRole('button', { name: /registrar otra incidencia/i }))

    expect(screen.getByText('Paso 1 de 4')).toBeInTheDocument()
    await waitFor(() => expect(localStorage.getItem(clave)).toBeNull())
  })
})

describe('ReporteInicialForm — envío pendiente restaurado de la cola offline', () => {
  /*
    Si la app se cierra con un envío en cola, al reabrirla debe reenviarlo sin
    esperar un evento de conexión ni una acción del director.
  */
  it('al montar con una cola pendiente y conexión disponible, la reenvía sin intervención', async () => {
    const almacen = crearAlmacenNavegador()
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
    vi.stubGlobal('fetch', fetchMock)

    renderFormulario()

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), { timeout: 5000 })
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(init.body as string).idempotencyKey).toBe('k-vieja')
    await waitFor(() => expect(screen.queryByText(/sin conexión/i)).not.toBeInTheDocument())
  })
})
