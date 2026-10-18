// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MOTIVOS_FIXTURE, TURNOS_FIXTURE } from '@/components/test-utils/parte-formulario'
import { RecorridoActualizacion } from './recorrido-actualizacion'
import { abrirAlmacenParte } from '@/lib/infraestructura/parte/almacen-indexeddb'
import { crearColaTrabajosEnvio } from '@/lib/infraestructura/parte/cola-trabajos-envio'

const syncMocks = vi.hoisted(() => ({ registrar: vi.fn(), pedir: vi.fn(), callback: null as ((clave: string) => void) | null }))
vi.mock('@/lib/infraestructura/parte/registrar-sync', () => ({
  registrarServiceWorkerParte: syncMocks.registrar,
  pedirSyncParte: syncMocks.pedir,
  alEnviarEnSegundoPlano: (callback: (clave: string) => void) => { syncMocks.callback = callback; return vi.fn() },
}))

const fotosMocks = vi.hoisted(() => ({ preparar: vi.fn(), declarar: vi.fn() }))
vi.mock('@/lib/infraestructura/fotos/flujo-formulario', () => ({
  prepararFotosFormulario: fotosMocks.preparar,
  declararFotosFormulario: fotosMocks.declarar,
}))

const CUE = '1801605-41'
const CLAVE = `parte-actualizar:draft:${CUE}`
const DRAFT_ID = `parte-actualizacion:${CUE}`
async function leerBorradorGuardado(draftId = DRAFT_ID) { return (await abrirAlmacenParte()).obtenerBorrador(draftId) }
beforeEach(() => { globalThis.indexedDB = new IDBFactory() })
const base = {
  ok: true, periodo: { id: 'p', nombre: 'ENOS' },
  parte: { id: 'parte', cueAnexo: CUE, estadoEstablecimiento: 'habitual', estadoEstablecimientoRigeDesde: '2026-10-02T10:00:00.000Z', actualizadaEn: '2026-10-03T10:00:00.000Z', asistenciaPedagogica: null },
  servicio: { estadoGeneral: 'normal', alcanceVigente: [] },
  afectaciones: [
    { id: 'a', motivo: 'Inundación', categoria: 'establecimiento', severidad: 'Media', descripcion: null, rigeDesde: '2026-10-02T10:00:00.000Z', creadaEn: '2026-10-02T10:00:00.000Z', causadaPorId: null, secciones: [], totales: { secciones: 0, alumnos: 0 } },
    { id: 'b', motivo: 'Sin energía o agua', categoria: 'establecimiento', severidad: 'Media', descripcion: null, rigeDesde: '2026-10-03T10:00:00.000Z', creadaEn: '2026-10-03T10:00:00.000Z', causadaPorId: 'a', secciones: [], totales: { secciones: 0, alumnos: 0 } },
  ], recientes: [], ultimaCarga: null,
}
function stub(ids = ['a', 'b']) {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') return new Response(JSON.stringify({ ok: true, movimientoId: 'm1' }), { status: 201 })
    const datos = { ...base, afectaciones: base.afectaciones.filter((situacion) => ids.includes(situacion.id)) }
    return new Response(JSON.stringify(url.includes('/historial') ? { ok: true, movimientos: [] } : datos), { status: 200 })
  }))
}
function stubConFotos() {
  vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:miniatura'), revokeObjectURL: vi.fn() })
  fotosMocks.preparar.mockImplementation(async (_draftId: string, fotos: Array<{ attachmentId: string }>) => {
    const almacen = await abrirAlmacenParte()
    for (const { attachmentId } of fotos) {
      await almacen.guardarArchivo(`${attachmentId}:optimizada`, new Blob(['optimizada'], { type: 'image/jpeg' }))
      await almacen.guardarArchivo(`${attachmentId}:miniatura`, new Blob(['miniatura'], { type: 'image/jpeg' }))
    }
    return {
      preparadas: fotos.map(({ attachmentId }) => ({
        attachmentId, bytesOptimizado: 9, bytesMiniatura: 9, optimizadaContentType: 'image/jpeg', miniaturaContentType: 'image/jpeg',
      })),
      errores: [],
    }
  })
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('/borradores/config')) return new Response(JSON.stringify({ borradoresSync: false, fotos: true, mapaBorradores: false }), { status: 200 })
    if (init?.method === 'POST') return new Response(JSON.stringify({ ok: true, movimientoId: 'm1' }), { status: 201 })
    return new Response(JSON.stringify(url.includes('/historial') ? { ok: true, movimientos: [] } : base), { status: 200 })
  }))
}
function montar(cue = CUE) { return render(<RecorridoActualizacion cue={cue} turnos={TURNOS_FIXTURE} motivos={MOTIVOS_FIXTURE} />) }
async function empezarYResponderPrimera() {
  fireEvent.click(await screen.findByRole('button', { name: 'Actualizar el parte' }))
  fireEvent.click(screen.getByRole('radio', { name: 'Sigue igual' }))
}
async function irAlResumen() {
  fireEvent.click(await screen.findByRole('button', { name: 'Actualizar el parte' }))
  for (let i = 0; i < 2; i++) {
    fireEvent.click(screen.getByRole('radio', { name: 'Sigue igual' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
  }
  fireEvent.click(screen.getByRole('radio', { name: 'No' }))
}
// An unmounted recorrido may still have a draft save in flight; its `.then` mirrors the draft into
// localStorage. Queue a read on the same store so that save (and its mirror) settles before the
// storage reset, otherwise the stale draft leaks into the next test as a "parte sin enviar".
async function esperarGuardadosPendientes() { await leerBorradorGuardado() }
afterEach(async () => { cleanup(); await esperarGuardadosPendientes(); vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); globalThis.indexedDB = new IDBFactory(); vi.clearAllMocks() })

function elegirAsistencia(valor: 'Sí' | 'No') {
  fireEvent.click(within(screen.getByRole('group', { name: '¿Se brinda asistencia pedagógica?' })).getByRole('radio', { name: valor }))
}

async function elegirModalidades(user: ReturnType<typeof userEvent.setup>, ...modalidades: string[]) {
  await user.click(screen.getByRole('combobox', { name: '¿De qué tipo?' }))
  for (const modalidad of modalidades) {
    await user.click(await screen.findByRole('option', { name: modalidad }))
  }
  await user.keyboard('{Escape}')
}

describe('RecorridoActualizacion: borrador local', () => {
  it('shows a B2 confirmation on reopen and leaves photo jobs queued', async () => {
    const almacen = await abrirAlmacenParte()
    await almacen.guardarContexto({ draftId: DRAFT_ID, idempotencyKey: 'sent-update' })
    await almacen.guardarBorrador({ draftId: DRAFT_ID, generacion: 1, version: 1, datos: { idsSituaciones: ['a', 'b'] }, actualizadoEn: new Date().toISOString() })
    const cola = crearColaTrabajosEnvio(almacen)
    await cola.encolar({ tipo: 'foto', idempotencyKey: 'photo-update', draftId: DRAFT_ID, cuerpo: { attachmentId: 'photo-2' } })
    await cola.confirmar('sent-update', { movimientoId: 'movement-update', rigeDesde: new Date().toISOString(), cierreDraft: 'enviado' })
    stub()

    montar()

    expect(await screen.findByRole('heading', { name: 'Parte actualizado' })).toBeInTheDocument()
    await waitFor(async () => expect(await almacen.obtenerBorrador(DRAFT_ID)).toBeNull())
    expect(await almacen.obtenerTrabajosEnvio()).toMatchObject([{ idempotencyKey: 'photo-update', tipo: 'foto' }])
  })

  it('guarda etapa y respuestas, y ofrece continuar al remontar', async () => {
    stub(); montar(); await empezarYResponderPrimera()
    await waitFor(async () => expect((await leerBorradorGuardado())?.datos).toMatchObject({ etapa: { revisar: 0 }, recorrido: { respuestas: { b: { tipo: 'sigue' } } }, idsSituaciones: ['a', 'b'] }))
    cleanup(); montar()
    expect(await screen.findByText('Tiene un parte sin enviar.')).toBeInTheDocument()
    const panel = screen.getByRole('dialog', { name: 'Tiene un parte sin enviar.' })
    expect(within(panel).getByRole('button', { name: 'Descartar' })).toBeInTheDocument()
    fireEvent.click(within(panel).getByRole('button', { name: 'Continuar donde lo dejé' }))
    expect(await screen.findByRole('region', { name: 'Situación 1 de 2' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Sigue igual' })).toBeChecked()
  })

  it('cerrar el panel del borrador sin elegir lo retoma, nunca lo descarta', async () => {
    stub(); montar(); await empezarYResponderPrimera()
    await waitFor(async () => expect(await leerBorradorGuardado()).not.toBeNull())
    cleanup(); montar()
    const panel = await screen.findByRole('dialog', { name: 'Tiene un parte sin enviar.' })
    fireEvent.keyDown(panel, { key: 'Escape' })
    expect(await screen.findByRole('region', { name: 'Situación 1 de 2' })).toBeInTheDocument()
    expect(await leerBorradorGuardado()).not.toBeNull()
  })

  it('restaura los aspectos y valores de un cambio al retomar', async () => {
    localStorage.setItem(CLAVE, JSON.stringify({
      generacion: 'g1',
      etapa: { revisar: 0 },
      recorrido: {
        respuestas: { b: { tipo: 'cambio', cambio: { aspectos: ['gravedad'], severidad: 'Media' } } },
        nueva: null,
        clasesEdificio: null,
      },
      asistenciaPedagogica: { brinda: '', modalidades: [] },
      idsSituaciones: ['a', 'b'],
    }))
    stub()
    montar()

    expect(await screen.findByText('Tiene un parte sin enviar.')).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: 'Continuar donde lo dejé' }))

    expect(await screen.findByRole('radio', { name: 'Cambió' })).toBeChecked()
    expect(screen.getByText('¿Qué tan grave es ahora?')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Media' })).toBeChecked()

    fireEvent.click(screen.getByRole('radio', { name: 'Sigue igual' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Cambió' }))
    expect(await screen.findByRole('checkbox', { name: 'La gravedad' })).toBeChecked()
  })

  it('migra un borrador legacy conservando la generación y las referencias a fotos', async () => {
    const cue = '1801605-42'
    const clave = `parte-actualizar:draft:${cue}`
    const draftId = `parte-actualizacion:${cue}`
    localStorage.setItem(clave, JSON.stringify({
      generacion: 'g-photo', etapa: { revisar: 0 },
      recorrido: { respuestas: { b: { tipo: 'sigue' } }, nueva: null, clasesEdificio: null },
      asistenciaPedagogica: { brinda: '', modalidades: [] }, idsSituaciones: ['a', 'b'], referenciasFotos: ['foto-1'],
    }))
    stub(); montar(cue)
    await screen.findByText('Tiene un parte sin enviar.')
    await waitFor(async () => expect((await leerBorradorGuardado(draftId))?.datos).toMatchObject({ generacion: 'g-photo', referenciasFotos: ['foto-1'] }))
    expect(localStorage.getItem(clave)).toBeNull()
  })

  it('avisa y empieza limpio si la forma del borrador es inválida', async () => {
    stub(); localStorage.setItem(CLAVE, '{"paso":"resumen"}'); montar()
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo recuperar la actualización guardada. Empezará una nueva.')
    expect(screen.queryByRole('button', { name: 'Continuar donde lo dejé' })).not.toBeInTheDocument()
    expect(localStorage.getItem(CLAVE)).not.toBeNull()
  })

  it('avisa y conserva el borrador si cambiaron las situaciones activas', async () => {
    localStorage.setItem(CLAVE, JSON.stringify({ generacion: 'g1', etapa: 'resumen', recorrido: { respuestas: { a: { tipo: 'sigue' } }, nueva: null, clasesEdificio: null }, asistenciaPedagogica: { brinda: '', modalidades: [] }, idsSituaciones: ['anterior'] }))
    stub(); montar()
    expect(await screen.findByRole('alert')).toHaveTextContent('La situación cambió desde que empezó. El borrador anterior se conservó')
    expect(await leerBorradorGuardado()).not.toBeNull()
  })

  it('cancelar el descarte conserva banner y borrador; confirmar lo elimina', async () => {
    localStorage.setItem(CLAVE, JSON.stringify({ generacion: 'g1', etapa: 'resumen', recorrido: { respuestas: { a: { tipo: 'sigue' }, b: { tipo: 'sigue' } }, nueva: null, clasesEdificio: null }, asistenciaPedagogica: { brinda: '', modalidades: [] }, idsSituaciones: ['a', 'b'] }))
    stub(); montar()
    fireEvent.click(await screen.findByRole('button', { name: 'Descartar' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.getByRole('button', { name: 'Continuar donde lo dejé' })).toBeInTheDocument()
    expect(await leerBorradorGuardado()).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, descartar' }))
    await waitFor(async () => expect(await leerBorradorGuardado()).toBeNull())
  })

  it('limpia la clave tras guardar con éxito y al cargar otra situación', async () => {
    let enviado = false
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        enviado = true
        return new Response(JSON.stringify({ ok: true, movimientoId: 'm1' }), { status: 201 })
      }
      const datos = { ...base, parte: { ...base.parte, asistenciaPedagogica: enviado ? { brinda: true, modalidades: ['Cuadernillos impresos'] } : null } }
      return new Response(JSON.stringify(url.includes('/historial') ? { ok: true, movimientos: [] } : datos), { status: 200 })
    }))
    montar(); await irAlResumen()
    await waitFor(async () => expect(await leerBorradorGuardado()).not.toBeNull())
    elegirAsistencia('Sí')
    await elegirModalidades(userEvent.setup(), 'Cuadernillos impresos')
    fireEvent.click(screen.getByRole('button', { name: 'Guardar actualización' }))
    await screen.findByText('Parte actualizado')
    await waitFor(async () => expect(await leerBorradorGuardado()).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar de nuevo' }))
    await screen.findByRole('button', { name: 'Actualizar el parte' })
    expect(await leerBorradorGuardado()).toBeNull()
  })

  it('al volver con el historial del navegador desde resumen conserva las respuestas', async () => {
    stub(); montar(); await irAlResumen()
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
    const preguntaNueva = await screen.findByRole('group', { name: '¿Hay algo nuevo?' })
    expect(within(preguntaNueva).getByRole('radio', { name: 'No' })).toBeInTheDocument()
  })

  it('guarda las referencias de las fotos y las muestra al remontar sin volver a pedirlas', async () => {
    stubConFotos(); montar()
    fireEvent.change(await screen.findByLabelText('Agregar fotos'), { target: { files: [new File(['a'], 'aula-1.jpg', { type: 'image/jpeg' })] } })
    await waitFor(async () => expect((await leerBorradorGuardado())?.datos).toMatchObject({ referenciasFotos: [expect.any(String)] }))
    cleanup(); montar()
    fireEvent.click(await screen.findByRole('button', { name: 'Continuar donde lo dejé' }))
    const fotosDelParte = await screen.findByRole('region', { name: 'Fotos del parte' })
    expect(within(fotosDelParte).getByText('1 de 3 fotos')).toBeInTheDocument()
    expect(within(fotosDelParte).getByRole('img', { name: 'Foto 1' })).toBeInTheDocument()
    expect(within(fotosDelParte).getByLabelText('Agregar más fotos')).toBeInTheDocument()
    expect(fotosMocks.preparar).toHaveBeenCalledTimes(1)
  })

  it('quitar una foto restaurada actualiza el borrador: la lista del picker es la única fuente', async () => {
    stubConFotos(); montar()
    fireEvent.change(await screen.findByLabelText('Agregar fotos'), { target: { files: [new File(['a'], 'aula-1.jpg', { type: 'image/jpeg' })] } })
    await waitFor(async () => expect((await leerBorradorGuardado())?.datos).toMatchObject({ referenciasFotos: [expect.any(String)] }))
    cleanup(); montar()
    fireEvent.click(await screen.findByRole('button', { name: 'Continuar donde lo dejé' }))
    const fotosDelParte = await screen.findByRole('region', { name: 'Fotos del parte' })
    fireEvent.click(within(fotosDelParte).getByRole('button', { name: 'Quitar Foto 1' }))
    expect(within(fotosDelParte).getByText('0 de 3 fotos')).toBeInTheDocument()
    await waitFor(async () => expect((await leerBorradorGuardado())?.datos).toMatchObject({ referenciasFotos: [] }))
  })

  it('avisa y descarta de la lista las fotos que ya no están en este dispositivo', async () => {
    stubConFotos()
    localStorage.setItem(CLAVE, JSON.stringify({
      generacion: 'g-perdida', etapa: { revisar: 0 },
      recorrido: { respuestas: { b: { tipo: 'sigue' } }, nueva: null, clasesEdificio: null },
      asistenciaPedagogica: { brinda: '', modalidades: [] }, idsSituaciones: ['a', 'b'], referenciasFotos: ['perdida'],
    }))
    montar()
    fireEvent.click(await screen.findByRole('button', { name: 'Continuar donde lo dejé' }))
    const fotosDelReporte = await screen.findByRole('region', { name: 'Fotos del reporte' })
    expect(within(fotosDelReporte).getByText('0 de 3 fotos')).toBeInTheDocument()
    expect(screen.getByText(/Algunas fotos ya no están disponibles en este dispositivo/)).toBeInTheDocument()
    await waitFor(async () => expect((await leerBorradorGuardado())?.datos).toMatchObject({ referenciasFotos: [] }))
  })
})
