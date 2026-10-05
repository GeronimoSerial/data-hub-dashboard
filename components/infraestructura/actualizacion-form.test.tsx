// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ActualizacionForm } from './actualizacion-form'
import { jsonResponse } from '@/lib/infraestructura/test-utils/http'
import { motivos, turnos } from '@/components/test-utils/parte-formulario'
import { CLAVE_VINCULO_VERIFICACION } from './verificacion-vinculo'
import { MENSAJES_ESTADO, guardarBorrador as guardarBorradorEnvio } from '@/lib/infraestructura/parte/envio-offline'
import { crearAlmacenParte } from '@/lib/infraestructura/parte/almacen-indexeddb'

const props = {
  cue: '12345678',
  turnos,
  motivos,
}

const MENSAJE_ACTUALIZACION_EXITOSA =
  'La actualización fue registrada. El estado actual y el historial ya reflejan los cambios informados.'

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
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
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

function renderFormulario(overrides: Partial<typeof props> = {}) {
  return render(<ActualizacionForm {...props} {...overrides} />)
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

async function guardarActualizacion() {
  await editarAfectacionVigente()
  fireEvent.click(screen.getByRole('radio', { name: 'Alta' }))
  fireEvent.click(screen.getByRole('button', { name: /revisar cambios/i }))
  fireEvent.click(screen.getByRole('button', { name: /guardar actualización/i }))
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
  globalThis.indexedDB = new IDBFactory()
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
    await guardarActualizacion()

    expect(await screen.findByText(MENSAJE_ACTUALIZACION_EXITOSA)).toBeInTheDocument()

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

  it('actualiza la asistencia pedagógica y envía sus modalidades', async () => {
    const fetchMock = stubFetchInicial()
    renderFormulario()
    await esperarParteCargado()
    fireEvent.click(screen.getByRole('radio', { name: 'Sí' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Cuadernillo' }))
    fireEvent.click(screen.getByRole('button', { name: /revisar cambios/i }))
    fireEvent.click(screen.getByRole('button', { name: /guardar actualización/i }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const [, init] = fetchMock.mock.calls[1]
    expect(JSON.parse(String((init as RequestInit).body)).asistenciaPedagogica).toEqual({ brinda: true, modalidades: ['Cuadernillo'] })
  })

  it('envía el vínculo de verificación y lo limpia solo después del éxito confirmado', async () => {
    sessionStorage.setItem(CLAVE_VINCULO_VERIFICACION, JSON.stringify({ id: 'v1', token: 't1' }))
    const fetchMock = stubFetchInicial()
    renderFormulario()
    await guardarActualizacion()

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const [, init] = fetchMock.mock.calls[1]
    expect(JSON.parse(String((init as RequestInit).body)).verificacion).toEqual({ id: 'v1', token: 't1' })
    await waitFor(() => expect(sessionStorage.getItem(CLAVE_VINCULO_VERIFICACION)).toBeNull())
  })

  it('omite el vínculo cuando no existe y lo conserva ante una respuesta fallida', async () => {
    const fetchMock = stubFetchInicial()
    renderFormulario()
    await guardarActualizacion()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const [, init] = fetchMock.mock.calls[1]
    expect(JSON.parse(String((init as RequestInit).body))).not.toHaveProperty('verificacion')

    cleanup()
    sessionStorage.setItem(CLAVE_VINCULO_VERIFICACION, JSON.stringify({ id: 'v1', token: 't1' }))
    const fetchFallido = vi.fn(async (url: string, _init?: RequestInit) => {
      if (String(url).startsWith('/api/problematicas/parte?')) return jsonResponse(RESPUESTA_BASE)
      return jsonResponse({ error: 'boom' }, 422)
    })
    vi.stubGlobal('fetch', fetchFallido)
    renderFormulario()
    await guardarActualizacion()
    await screen.findByText('No se pudo enviar: boom')
    const posteo = fetchFallido.mock.calls.find(([url]) => String(url) === '/api/problematicas/parte')
    expect(posteo).toBeDefined()
    expect(JSON.parse(String((posteo?.[1] as RequestInit).body)).verificacion).toEqual({ id: 'v1', token: 't1' })
    expect(sessionStorage.getItem(CLAVE_VINCULO_VERIFICACION)).not.toBeNull()
  })

  // La confirmación de la actualización tenía el mismo callejón sin salida
  // que el reporte inicial: sólo el mensaje verde, sin manera de seguir.
  it('la confirmación ofrece volver al panel y registrar otra incidencia', async () => {
    stubFetchInicial()
    renderFormulario()
    await guardarActualizacion()

    await screen.findByText(MENSAJE_ACTUALIZACION_EXITOSA)

    const volverAlPanel = screen.getByRole('link', { name: /volver al panel/i })
    expect(volverAlPanel).toHaveAttribute('href', `/problematicas/parte?cue=${props.cue}`)

    fireEvent.click(screen.getByRole('button', { name: /registrar otra incidencia/i }))

    // Vuelve a buscar el estado vigente en vez de reutilizar el que ya quedó
    // viejo: se ve la pantalla de carga y después el formulario, de nuevo.
    expect(await screen.findByRole('button', { name: /revisar cambios/i })).toBeDisabled()
  })

  it('el recordatorio de motivo duplicado en la actualización se muestra pero no bloquea el envío', async () => {
    stubFetchInicial()
    renderFormulario()

    await editarAfectacionVigente()

    fireEvent.click(screen.getByRole('button', { name: /agregar otra situación/i }))

    const radiosEstablecimiento = screen.getAllByRole('radio', { name: /afecta al establecimiento/i })
    fireEvent.click(radiosEstablecimiento[radiosEstablecimiento.length - 1])
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))

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

  it('si falla la conexión al guardar, el envío queda pendiente y la información ingresada se mantiene', async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (String(url).startsWith('/api/problematicas/parte?')) return jsonResponse(RESPUESTA_BASE)
      throw new Error('network')
    })
    vi.stubGlobal('fetch', fetchMock)

    renderFormulario()
    await guardarActualizacion()

    expect(
      await screen.findByText(MENSAJES_ESTADO['pendiente-envio']),
    ).toBeInTheDocument()

    expect(screen.getByRole('heading', { name: 'Cambios que se registrarán' })).toBeInTheDocument()
    expect(screen.getByText(/Media.*Alta/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /volver y corregir/i }))
    // Se vuelve al inventario, donde la afectación aparece plegada con su
    // resumen ya corregido; abrirla muestra el dato intacto.
    await editarAfectacionVigente()
    expect(screen.getByRole('radio', { name: 'Alta' })).toBeChecked()
  })

  // Hallazgo de revisión #2 (gate N1): un 2xx con un cuerpo que no cumple el
  // contrato esperado (sin `movimientoId`) no puede tratarse como éxito.
  it('un 2xx con cuerpo inesperado NO confirma la actualización y reintenta con la misma clave', async () => {
    let posteos = 0
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (String(url).startsWith('/api/problematicas/parte?')) return jsonResponse(RESPUESTA_BASE)
      posteos += 1
      if (posteos === 1) return jsonResponse({ algo: 'inesperado' }, 200)
      return jsonResponse({ ok: true, movimientoId: 'm1' }, 200)
    })
    vi.stubGlobal('fetch', fetchMock)

    renderFormulario()
    await guardarActualizacion()

    expect(
      await screen.findByText('No se pudo enviar: respuesta inesperada del servidor'),
    ).toBeInTheDocument()
    expect(posteos).toBe(1)

    // Reintento manual: reutiliza la MISMA idempotencyKey.
    fireEvent.click(screen.getByRole('button', { name: /guardar actualización/i }))
    expect(await screen.findByText(MENSAJE_ACTUALIZACION_EXITOSA)).toBeInTheDocument()
    expect(posteos).toBe(2)

    const claves = fetchMock.mock.calls
      .filter(
        ([url, init]) =>
          String(url) === '/api/problematicas/parte' &&
          (init as RequestInit | undefined)?.method === 'POST',
      )
      .map(([, init]) => JSON.parse(String((init as RequestInit).body)).idempotencyKey)
    expect(claves).toHaveLength(2)
    expect(claves[0]).toBe(claves[1])
  })

  it('un 422 no se reintenta: muestra el error y el borrador queda editable', async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (String(url).startsWith('/api/problematicas/parte?')) return jsonResponse(RESPUESTA_BASE)
      return jsonResponse({ error: 'dato inválido' }, 422)
    })
    vi.stubGlobal('fetch', fetchMock)

    renderFormulario()
    await guardarActualizacion()

    expect(await screen.findByText('No se pudo enviar: dato inválido')).toBeInTheDocument()

    const posteos = fetchMock.mock.calls.filter(
      ([url, init]) =>
        String(url) === '/api/problematicas/parte' &&
        (init as RequestInit | undefined)?.method === 'POST',
    )
    expect(posteos).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: /volver y corregir/i }))
    await editarAfectacionVigente()
    expect(screen.getByRole('radio', { name: 'Alta' })).toBeChecked()
  })

  it('una sesión vencida (401) conserva el borrador y explica cómo retomar', async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (String(url).startsWith('/api/problematicas/parte?')) return jsonResponse(RESPUESTA_BASE)
      return jsonResponse({ error: 'unauthorized' }, 401)
    })
    vi.stubGlobal('fetch', fetchMock)

    renderFormulario()
    await guardarActualizacion()

    expect(await screen.findByText(/sesión/i)).toBeInTheDocument()

    // El borrador no se pierde: el cambio cargado sigue visible y editable.
    expect(screen.getByText(/Media.*Alta/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /volver y corregir/i }))
    await editarAfectacionVigente()
    expect(screen.getByRole('radio', { name: 'Alta' })).toBeChecked()
  })

  it('un 5xx muestra error del servidor y se reintenta solo por temporizador con la misma clave', async () => {
    let posteos = 0
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (String(url).startsWith('/api/problematicas/parte?')) return jsonResponse(RESPUESTA_BASE)
      posteos += 1
      if (posteos === 1) return jsonResponse({ error: 'sin servicio' }, 503)
      return jsonResponse({ ok: true, movimientoId: 'm1' }, 200)
    })
    vi.stubGlobal('fetch', fetchMock)

    renderFormulario()
    await guardarActualizacion()

    expect(await screen.findByText(MENSAJES_ESTADO['error-servidor'])).toBeInTheDocument()
    expect(screen.queryByText(/sin conexión/i)).not.toBeInTheDocument()

    // El reintento llega por backoff; no se emite ningún evento 'online'.
    expect(await screen.findByText(MENSAJE_ACTUALIZACION_EXITOSA, undefined, { timeout: 5000 })).toBeInTheDocument()
    expect(posteos).toBe(2)

    const claves = fetchMock.mock.calls
      .filter(
        ([url, init]) =>
          String(url) === '/api/problematicas/parte' &&
          (init as RequestInit | undefined)?.method === 'POST',
      )
      .map(([, init]) => JSON.parse(String((init as RequestInit).body)).idempotencyKey)
    expect(claves).toHaveLength(2)
    expect(claves[0]).toBe(claves[1])
  })
})
describe('ActualizacionForm — lo vigente se afirma, no se vuelve a preguntar', () => {
  it('abre mostrando el estado vigente cerrado, sin grupos de radio a medio llenar', async () => {
    stubFetchInicial()
    renderFormulario()

    await esperarParteCargado()

    // Antes se leía "Estado actual: X" y debajo radios TODOS vacíos, que se
    // ve como un formulario sin completar.
    expect(screen.getByText('Funcionamiento escolar normal')).toBeInTheDocument()
    expect(screen.getByText('Sin daños / en uso normal')).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'Funcionamiento escolar interrumpido' })).toBeNull()
    expect(screen.queryByRole('radio', { name: 'Evacuado' })).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Cambiar' }).length).toBeGreaterThanOrEqual(2)
  })

  it('"Cambiar" abre las opciones y "Dejar como está" las cierra borrando la selección', async () => {
    stubFetchInicial()
    renderFormulario()

    await esperarParteCargado()

    const [cambiarClases] = screen.getAllByRole('button', { name: 'Cambiar' })
    fireEvent.click(cambiarClases)

    fireEvent.click(screen.getByRole('radio', { name: 'Funcionamiento escolar interrumpido' }))
    expect(screen.getByRole('button', { name: /revisar cambios/i })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: 'Dejar como está' }))

    expect(screen.queryByRole('radio', { name: 'Funcionamiento escolar interrumpido' })).toBeNull()
    expect(screen.getByRole('button', { name: /revisar cambios/i })).toBeDisabled()
  })

  // El alcance describe a quiénes alcanza una SUSPENSIÓN: preguntarlo tras
  // elegir "Funcionamiento escolar normal" no quiere decir nada.
  it('el alcance sólo se pregunta al suspender las clases', async () => {
    stubFetchInicial()
    renderFormulario()

    await esperarParteCargado()

    const [cambiarClases] = screen.getAllByRole('button', { name: 'Cambiar' })
    fireEvent.click(cambiarClases)

    fireEvent.click(screen.getByRole('radio', { name: 'Funcionamiento escolar normal' }))
    expect(screen.queryByRole('radio', { name: 'Todo el establecimiento' })).toBeNull()

    fireEvent.click(screen.getByRole('radio', { name: 'Funcionamiento escolar interrumpido' }))
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

describe('ActualizacionForm — una situación en blanco no es un cambio', () => {
  /*
    Bug visto en el navegador: apenas se pulsaba "Agregar otra situación", el
    panel de cambios sin guardar ya anunciaba `Se agregó "" · Severidad Baja`
    y "Revisar cambios" quedaba habilitado. `borradorAAfectacion` rellena los
    campos que faltan con valores por defecto para poder alimentar diffParte,
    y esos defaults se leían como una declaración del director — incluso una
    severidad que nunca eligió.
  */
  it('agregar una situación vacía no cuenta como cambio ni habilita el guardado', async () => {
    stubFetchInicial()
    renderFormulario()

    await esperarParteCargado()

    fireEvent.click(screen.getByRole('button', { name: /agregar otra situación/i }))

    expect(screen.getByText(/todavía no realizó cambios/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /revisar cambios/i })).toBeDisabled()
    expect(screen.queryByText(/Se agregó ""/)).toBeNull()
  })

  it('recién cuenta como cambio cuando la situación queda completa', async () => {
    stubFetchInicial()
    renderFormulario()

    await esperarParteCargado()

    fireEvent.click(screen.getByRole('button', { name: /agregar otra situación/i }))

    const categorias = screen.getAllByRole('radio', { name: /Afecta al establecimiento/ })
    fireEvent.click(categorias[categorias.length - 1])
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    const motivos = screen.getAllByRole('radio', { name: 'Tormenta severa' })
    fireEvent.click(motivos[motivos.length - 1])
    const severidades = screen.getAllByRole('radio', { name: 'Media' })
    fireEvent.click(severidades[severidades.length - 1])
    const secciones = screen.getAllByRole('checkbox', { name: /1° "A"/ })
    fireEvent.click(secciones[secciones.length - 1])

    expect(screen.getByRole('heading', { name: /sin guardar: 1 cambio/i })).toBeInTheDocument()
    expect(screen.getByText(/Se agregó "Tormenta severa"/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /revisar cambios/i })).toBeEnabled()
  })
})

describe('ActualizacionForm — borrador local (#32) e historial del navegador (#31)', () => {
  const clave = `parte-actualizacion:draft:${props.cue}`

  it('guarda el borrador con la pantalla activa y lo restaura al remontar (#32)', async () => {
    stubFetchInicial()
    const primero = renderFormulario()
    await editarAfectacionVigente()
    fireEvent.click(screen.getByRole('radio', { name: 'Alta' }))
    fireEvent.click(screen.getByRole('button', { name: /revisar cambios/i }))

    expect(screen.getByRole('heading', { name: 'Cambios que se registrarán' })).toBeInTheDocument()
    await waitFor(() => {
      expect(localStorage.getItem(clave)).not.toBeNull()
    })

    // Recarga simulada: el formulario vuelve a montar con el mismo storage.
    primero.unmount()
    stubFetchInicial()
    renderFormulario()

    expect(
      await screen.findByRole('heading', { name: 'Cambios que se registrarán' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/Media.*Alta/)).toBeInTheDocument()
  })

  it('un popstate vuelve del resumen al formulario conservando los cambios (#31)', async () => {
    stubFetchInicial()
    renderFormulario()
    await editarAfectacionVigente()
    fireEvent.click(screen.getByRole('radio', { name: 'Alta' }))
    fireEvent.click(screen.getByRole('button', { name: /revisar cambios/i }))
    expect(screen.getByRole('heading', { name: 'Cambios que se registrarán' })).toBeInTheDocument()

    fireEvent(window, new PopStateEvent('popstate'))

    expect(screen.getByRole('button', { name: /revisar cambios/i })).toBeInTheDocument()
    await editarAfectacionVigente()
    expect(screen.getByRole('radio', { name: 'Alta' })).toBeChecked()
  })

  it('un guardado exitoso limpia la clave del borrador de la actualización', async () => {
    stubFetchInicial()
    renderFormulario()
    await editarAfectacionVigente()
    fireEvent.click(screen.getByRole('radio', { name: 'Alta' }))
    fireEvent.click(screen.getByRole('button', { name: /revisar cambios/i }))
    fireEvent.click(screen.getByRole('button', { name: /guardar actualización/i }))

    await screen.findByText(MENSAJE_ACTUALIZACION_EXITOSA)
    await waitFor(() => {
      expect(localStorage.getItem(clave)).toBeNull()
    })
  })

  it('"Registrar otra incidencia" limpia el borrador de la actualización', async () => {
    stubFetchInicial()
    renderFormulario()
    await editarAfectacionVigente()
    fireEvent.click(screen.getByRole('radio', { name: 'Alta' }))
    fireEvent.click(screen.getByRole('button', { name: /revisar cambios/i }))
    fireEvent.click(screen.getByRole('button', { name: /guardar actualización/i }))
    await screen.findByText(MENSAJE_ACTUALIZACION_EXITOSA)

    fireEvent.click(screen.getByRole('button', { name: /registrar otra incidencia/i }))

    expect(await screen.findByRole('button', { name: /revisar cambios/i })).toBeDisabled()
    await waitFor(() => {
      expect(localStorage.getItem(clave)).toBeNull()
    })
  })
})

describe('ActualizacionForm — envío pendiente restaurado de la cola offline', () => {
  /*
    Mismo requisito que en el reporte inicial: un envío en cola debe
    restaurarse al montar aunque no haya borrador activo y reenviarse sin
    esperar un evento de conexión ni un click manual.
  */
  it('al montar con una cola pendiente y conexión disponible, la reenvía sin intervención', async () => {
    const fetchMock = stubFetchInicial()

    // Cola de envío dejada pendiente por una sesión anterior.
    await guardarBorradorEnvio(await crearAlmacenParte(), {
      tipo: 'actualizar',
      cue: props.cue,
      idempotencyKey: 'idem-offline',
      datos: {},
      estado: 'pendiente-envio',
      intentos: 1,
      actualizadoEn: new Date().toISOString(),
    })
    // El formulario quedó en la pantalla de resumen, listo para reintentar.
    localStorage.setItem(
      `parte-actualizacion:draft:${props.cue}`,
      JSON.stringify({
        generacion: 'g-offline',
        paso: 'resumen',
        afectaciones: [],
        servicioEstado: '',
        servicioAlcanceTipo: '',
        servicioTurnos: [],
        servicioSecciones: [],
        estadoEstablecimiento: '',
        rigeDesde: new Date().toISOString(),
        idempotencyKey: 'idem-offline',
        tocadas: [],
      }),
    )

    renderFormulario()

    const posteos = () =>
      fetchMock.mock.calls.filter(
        ([url, init]) =>
          String(url) === '/api/problematicas/parte' &&
          (init as RequestInit | undefined)?.method === 'POST',
      )

    expect(
      await screen.findByText(MENSAJE_ACTUALIZACION_EXITOSA, undefined, { timeout: 5000 }),
    ).toBeInTheDocument()
    expect(posteos()).toHaveLength(1)
  })
})
