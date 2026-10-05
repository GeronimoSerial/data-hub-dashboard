// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MOTIVOS_FIXTURE, TURNOS_FIXTURE } from '@/components/test-utils/parte-formulario'
import { CLAVE_VINCULO_VERIFICACION } from '@/components/infraestructura/verificacion-vinculo'
import { claveBorrador, MENSAJES_ESTADO } from '@/lib/infraestructura/parte/envio-offline'
import type * as AlmacenIndexedDb from '@/lib/infraestructura/parte/almacen-indexeddb'
import { RecorridoActualizacion } from './recorrido-actualizacion'

const syncMocks = vi.hoisted(() => ({
  registrar: vi.fn(),
  pedir: vi.fn(),
  callback: null as ((clave: string) => void) | null,
}))
const almacenMock = vi.hoisted(() => ({ crear: vi.fn() }))

vi.mock('@/lib/infraestructura/parte/registrar-sync', () => ({
  registrarServiceWorkerParte: syncMocks.registrar,
  pedirSyncParte: syncMocks.pedir,
  alEnviarEnSegundoPlano: (callback: (clave: string) => void) => {
    syncMocks.callback = callback
    return vi.fn()
  },
}))

vi.mock('@/lib/infraestructura/parte/almacen-indexeddb', async (importOriginal) => {
  const original = await importOriginal<typeof AlmacenIndexedDb>()
  return {
    ...original,
    crearAlmacenParte: async () => {
      almacenMock.crear()
      return original.crearAlmacenParte()
    },
  }
})

const CUE = '1801605-41'
const guardado = 'Parte actualizado.'
const base = {
  ok: true, periodo: { id: 'p', nombre: 'ENOS' },
  parte: { id: 'parte', cueAnexo: CUE, estadoEstablecimiento: 'habitual', estadoEstablecimientoRigeDesde: '2026-10-02T10:00:00.000Z', actualizadaEn: '2026-10-03T10:00:00.000Z' },
  servicio: { estadoGeneral: 'normal', alcanceVigente: [] },
  afectaciones: [
    { id: 'a', motivo: 'Inundación', categoria: 'establecimiento', severidad: 'Media', descripcion: null, rigeDesde: '2026-10-02T10:00:00.000Z', creadaEn: '2026-10-02T10:00:00.000Z', causadaPorId: null, secciones: [], totales: { secciones: 0, alumnos: 0 } },
    { id: 'b', motivo: 'Sin energía o agua', categoria: 'establecimiento', severidad: 'Media', descripcion: null, rigeDesde: '2026-10-03T10:00:00.000Z', creadaEn: '2026-10-03T10:00:00.000Z', causadaPorId: 'a', secciones: [], totales: { secciones: 0, alumnos: 0 } },
  ], recientes: [], ultimaCarga: null,
}
const respuesta = (body: Record<string, unknown> = { ok: true, movimientoId: 'm1' }, status = 201) => new Response(JSON.stringify(body), { status })
function stub(fetcher?: (url: string, init?: RequestInit) => Promise<Response>) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') return fetcher ? fetcher(url, init) : respuesta()
    return new Response(JSON.stringify(url.includes('/historial') ? { ok: true, movimientos: [] } : base), { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}
function montar() { return render(<RecorridoActualizacion cue={CUE} turnos={TURNOS_FIXTURE} motivos={MOTIVOS_FIXTURE} />) }
async function prepararResumen() {
  fireEvent.click(await screen.findByRole('button', { name: 'Actualizar el parte' }))
  for (let i = 0; i < 2; i++) {
    fireEvent.click(screen.getByRole('radio', { name: 'Sigue igual' }))
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
  }
  fireEvent.click(screen.getByRole('radio', { name: 'No, no hay una situación nueva' }))
}
async function enviar() { await prepararResumen(); fireEvent.click(screen.getByRole('button', { name: 'Enviar' })) }
function posteos(fetchMock: ReturnType<typeof vi.fn>) { return fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST') }
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); vi.useRealTimers(); vi.clearAllMocks(); syncMocks.callback = null })

describe('RecorridoActualizacion: envío', () => {
  it('guarda con POST, instante de envío y muestra confirmación', async () => {
    const fetchMock = stub(); montar(); await enviar()
    await screen.findByText(guardado)
    const [, init] = posteos(fetchMock)[0]
    const cuerpo = JSON.parse(String((init as RequestInit).body))
    expect(cuerpo).toMatchObject({ cue: CUE, afectacionesConfirmadas: ['a', 'b'] })
    expect(cuerpo.rigeDesde).toEqual(expect.any(String))
    expect(cuerpo.idempotencyKey).toEqual(expect.any(String))
  })

  it('envía la asistencia pedagógica solo cuando cambia respecto del valor vigente', async () => {
    const fetchMock = stub(); montar(); await prepararResumen()
    const grupo = screen.getByRole('group', { name: '¿Se brinda asistencia pedagógica?' })
    fireEvent.click(within(grupo).getByRole('radio', { name: 'Sí' }))
    fireEvent.click(within(grupo).getByRole('checkbox', { name: 'Clase virtual' }))
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))
    await screen.findByText(guardado)
    expect(JSON.parse(String((posteos(fetchMock)[0][1] as RequestInit).body))).toMatchObject({
      afectacionesConfirmadas: ['a', 'b'],
      asistenciaPedagogica: { brinda: true, modalidades: ['Clase virtual'] },
    })
  })

  it('no envía asistencia pedagógica si no se modificó y exige modalidad al elegir que sí', async () => {
    const fetchMock = stub(); montar(); await prepararResumen()
    const grupo = screen.getByRole('group', { name: '¿Se brinda asistencia pedagógica?' })
    fireEvent.click(within(grupo).getByRole('radio', { name: 'Sí' }))
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Elija al menos una modalidad de asistencia pedagógica.')
    expect(posteos(fetchMock)).toHaveLength(0)
    fireEvent.click(within(grupo).getByRole('checkbox', { name: 'Cuadernillo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))
    await screen.findByText(guardado)
    const cuerpo = JSON.parse(String((posteos(fetchMock)[0][1] as RequestInit).body))
    expect(cuerpo.asistenciaPedagogica).toEqual({ brinda: true, modalidades: ['Cuadernillo'] })
  })

  it('no incluye asistencia pedagógica en el envío si no se tocó', async () => {
    const fetchMock = stub(); montar(); await enviar(); await screen.findByText(guardado)
    expect(JSON.parse(String((posteos(fetchMock)[0][1] as RequestInit).body))).not.toHaveProperty('asistenciaPedagogica')
  })

  it('registra el service worker al montar', async () => {
    stub(); montar()
    await screen.findByRole('button', { name: 'Actualizar el parte' })
    expect(syncMocks.registrar).toHaveBeenCalledOnce()
  })

  it('envía vínculo de verificación y lo limpia solo al confirmar el éxito', async () => {
    sessionStorage.setItem(CLAVE_VINCULO_VERIFICACION, JSON.stringify({ id: 'v1', token: 't1' }))
    const fetchMock = stub(); montar(); await enviar(); await screen.findByText(guardado)
    expect(JSON.parse(String((posteos(fetchMock)[0][1] as RequestInit).body)).verificacion).toEqual({ id: 'v1', token: 't1' })
    expect(sessionStorage.getItem(CLAVE_VINCULO_VERIFICACION)).toBeNull()
  })

  it('omite vínculo ausente y lo conserva si la respuesta falla', async () => {
    const fetchMock = stub(); montar(); await enviar(); await screen.findByText(guardado)
    expect(JSON.parse(String((posteos(fetchMock)[0][1] as RequestInit).body))).not.toHaveProperty('verificacion')
    cleanup(); sessionStorage.setItem(CLAVE_VINCULO_VERIFICACION, JSON.stringify({ id: 'v1', token: 't1' }))
    const fallo = stub(async () => respuesta({ error: 'dato inválido' }, 422)); montar(); await enviar()
    await screen.findByText(/dato inválido/)
    expect(sessionStorage.getItem(CLAVE_VINCULO_VERIFICACION)).not.toBeNull()
    expect(fallo).toHaveBeenCalled()
  })

  it('la confirmación permite volver al panel o cargar otra situación recargando el estado', async () => {
    const erroresConsola = vi.spyOn(console, 'error').mockImplementation(() => {})
    const avisosConsola = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const fetchMock = stub(); montar(); await enviar(); await screen.findByText(guardado)
      expect(screen.getByRole('link', { name: 'Volver al panel' })).toHaveAttribute('href', `/problematicas/parte?cue=${CUE}`)
      const botonCargarOtro = screen.getByRole('button', { name: 'Cargar otra situación' })
      expect(botonCargarOtro.tagName).toBe('BUTTON')
      const avisos = [...erroresConsola.mock.calls, ...avisosConsola.mock.calls].flat().map(String).join('\n')
      expect(avisos).not.toContain('Base UI: a component that acts as a button expected a native <button>')
      const getsAntes = fetchMock.mock.calls.filter(([, init]) => !init || (init as RequestInit).method !== 'POST').length
      fireEvent.click(botonCargarOtro)
      await screen.findByRole('button', { name: 'Actualizar el parte' })
      expect(fetchMock.mock.calls.filter(([, init]) => !init || (init as RequestInit).method !== 'POST').length).toBeGreaterThan(getsAntes)
    } finally {
      erroresConsola.mockRestore()
      avisosConsola.mockRestore()
    }
  })

  it('si falla la conexión conserva el recorrido y deja el envío pendiente', async () => {
    const fetchMock = stub(async () => { throw new Error('network') }); montar(); await enviar()
    expect(await screen.findByText(MENSAJES_ESTADO['pendiente-envio'])).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(MENSAJES_ESTADO['pendiente-envio'])
    expect(screen.getByRole('button', { name: 'Envío pendiente' })).toBeDisabled()
    expect(screen.getByText(/Inundación/)).toBeInTheDocument()
    expect(screen.queryByText(guardado)).toBeNull()
    expect(posteos(fetchMock)).toHaveLength(1)
    expect(syncMocks.pedir).toHaveBeenCalled()
  })

  it('el reintento automático al volver la conexión actúa sobre una cola reintentable', async () => {
    let intentos = 0
    const fetchMock = stub(async () => {
      intentos += 1
      if (intentos === 1) throw new Error('network')
      return respuesta()
    })
    montar(); await enviar()
    expect(await screen.findByText(MENSAJES_ESTADO['pendiente-envio'])).toBeInTheDocument()
    await act(async () => { window.dispatchEvent(new Event('online')) })
    await screen.findByText(guardado)
    expect(posteos(fetchMock)).toHaveLength(2)
  })

  it('el aviso del service worker confirma el envío de la cola de este CUE', async () => {
    stub(); montar()
    await screen.findByRole('button', { name: 'Actualizar el parte' })
    await waitFor(() => expect(syncMocks.callback).toEqual(expect.any(Function)))
    act(() => syncMocks.callback?.(claveBorrador('actualizacion', CUE)))
    expect(await screen.findByText(guardado)).toBeInTheDocument()
  })

  it('un 2xx inesperado no confirma y un reintento conserva idempotencyKey', async () => {
    let n = 0; const fetchMock = stub(async () => ++n === 1 ? respuesta({ raro: true }, 200) : respuesta())
    montar(); await enviar(); expect(await screen.findByText(/respuesta inesperada del servidor/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' })); await screen.findByText(guardado)
    const claves = posteos(fetchMock).map(([, init]) => JSON.parse(String((init as RequestInit).body)).idempotencyKey)
    expect(claves).toHaveLength(2); expect(claves[0]).toBe(claves[1])
  })

  it('un 422 muestra el error sin reintentar y permite corregir', async () => {
    const fetchMock = stub(async () => respuesta({ error: 'dato inválido' }, 422)); montar(); await enviar()
    expect(await screen.findByText(/dato inválido/)).toBeInTheDocument()
    expect(posteos(fetchMock)).toHaveLength(1)
    window.dispatchEvent(new Event('online'))
    expect(posteos(fetchMock)).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Volver y corregir' })).toBeEnabled()
  })

  it('un 401 conserva el recorrido e indica que la sesión venció', async () => {
    const fetchMock = stub(async () => respuesta({ error: 'unauthorized' }, 401)); montar(); await enviar()
    expect(await screen.findByText(/sesión/i)).toBeInTheDocument()
    expect(screen.getByText(/Inundación/)).toBeInTheDocument(); expect(posteos(fetchMock)).toHaveLength(1)
  })

  it('un 5xx muestra error de servidor y reintenta con la misma clave', async () => {
    let n = 0
    const fetchMock = stub(async () => ++n === 1 ? respuesta({ error: 'sin servicio' }, 503) : respuesta())
    montar(); await prepararResumen(); fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))
    await waitFor(() => expect(screen.getByText(MENSAJES_ESTADO['error-servidor'])).toBeInTheDocument())
    const primera = JSON.parse(String((posteos(fetchMock)[0][1] as RequestInit).body)).idempotencyKey
    await screen.findByText(guardado, undefined, { timeout: 5000 })
    expect(JSON.parse(String((posteos(fetchMock)[1][1] as RequestInit).body)).idempotencyKey).toBe(primera)
  })

  it('el aviso de error ofrece un reintento manual inmediato', async () => {
    let n = 0
    const fetchMock = stub(async () => ++n === 1 ? respuesta({ error: 'sin servicio' }, 503) : respuesta())
    montar(); await enviar()
    const aviso = await screen.findByRole('alert')
    expect(within(aviso).getByText(MENSAJES_ESTADO['error-servidor'])).toBeInTheDocument()
    expect(within(aviso).getByRole('button', { name: 'Reintentar ahora' })).toHaveClass('ui-button')
    fireEvent.click(within(aviso).getByRole('button', { name: 'Reintentar ahora' }))
    await screen.findByText(guardado)
    expect(posteos(fetchMock)).toHaveLength(2)
  })

  it('crea el almacén al usar la cola y reenvía el borrador pendiente al montar', async () => {
    const fetchMock = stub()
    localStorage.setItem(claveBorrador('actualizacion', CUE), JSON.stringify({
      tipo: 'actualizacion', cue: CUE, idempotencyKey: 'pendiente-1',
      datos: { cue: CUE, rigeDesde: '2026-10-03T10:00:00.000Z', afectacionesConfirmadas: ['a', 'b'] },
      url: '/api/problematicas/parte', estado: 'pendiente-envio', intentos: 1,
      actualizadoEn: '2026-10-03T10:00:00.000Z',
    }))
    montar()
    expect(almacenMock.crear).not.toHaveBeenCalled()
    await screen.findByText(guardado)
    expect(almacenMock.crear).toHaveBeenCalledOnce()
    expect(posteos(fetchMock)).toHaveLength(1)
    expect(JSON.parse(String((posteos(fetchMock)[0][1] as RequestInit).body)).idempotencyKey).toBe('pendiente-1')
  })

  it('sin Background Sync disponible sigue enviando en primer plano', async () => {
    const fetchMock = stub(); montar(); await enviar(); await screen.findByText(guardado)
    expect(posteos(fetchMock)).toHaveLength(1)
  })
})
