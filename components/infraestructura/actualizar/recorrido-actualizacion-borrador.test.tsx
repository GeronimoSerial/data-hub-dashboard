// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MOTIVOS_FIXTURE, TURNOS_FIXTURE } from '@/components/test-utils/parte-formulario'
import { RecorridoActualizacion } from './recorrido-actualizacion'

const syncMocks = vi.hoisted(() => ({ registrar: vi.fn(), pedir: vi.fn(), callback: null as ((clave: string) => void) | null }))
vi.mock('@/lib/infraestructura/parte/registrar-sync', () => ({
  registrarServiceWorkerParte: syncMocks.registrar,
  pedirSyncParte: syncMocks.pedir,
  alEnviarEnSegundoPlano: (callback: (clave: string) => void) => { syncMocks.callback = callback; return vi.fn() },
}))

const CUE = '1801605-41'
const CLAVE = `parte-actualizar:draft:${CUE}`
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
function montar() { return render(<RecorridoActualizacion cue={CUE} turnos={TURNOS_FIXTURE} motivos={MOTIVOS_FIXTURE} />) }
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
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); vi.clearAllMocks() })

describe('RecorridoActualizacion: borrador local', () => {
  it('guarda etapa y respuestas, y ofrece continuar al remontar', async () => {
    stub(); montar(); await empezarYResponderPrimera()
    await waitFor(() => expect(JSON.parse(localStorage.getItem(CLAVE) ?? '{}')).toMatchObject({ etapa: { revisar: 0 }, recorrido: { respuestas: { b: { tipo: 'sigue' } } }, idsSituaciones: ['a', 'b'] }))
    cleanup(); montar()
    expect(await screen.findByText('Tiene un parte sin enviar.')).toBeInTheDocument()
    const banner = screen.getByRole('complementary', { name: 'Parte sin enviar' })
    const continuar = within(banner).getByRole('button', { name: 'Continuar donde lo dejé' })
    const descartar = within(banner).getByRole('button', { name: 'Descartar' })
    expect(continuar).toHaveClass('ui-button--secondary')
    expect(within(banner).getByRole('button', { name: 'Descartar' })).toHaveClass('ui-button--ghost')
    expect(continuar.compareDocumentPosition(descartar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(within(banner).getByRole('button', { name: 'Continuar donde lo dejé' }))
    expect(await screen.findByRole('region', { name: 'Situación 1 de 2' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Sigue igual' })).toBeChecked()
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

  it('avisa y empieza limpio si la forma del borrador es inválida', async () => {
    stub(); localStorage.setItem(CLAVE, '{"paso":"resumen"}'); montar()
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo recuperar la actualización guardada. Empezará una nueva.')
    expect(screen.queryByRole('button', { name: 'Continuar donde lo dejé' })).not.toBeInTheDocument()
  })

  it('avisa y descarta el borrador si cambiaron las situaciones activas', async () => {
    localStorage.setItem(CLAVE, JSON.stringify({ generacion: 'g1', etapa: 'resumen', recorrido: { respuestas: { a: { tipo: 'sigue' } }, nueva: null, clasesEdificio: null }, asistenciaPedagogica: { brinda: '', modalidades: [] }, idsSituaciones: ['anterior'] }))
    stub(); montar()
    expect(await screen.findByRole('alert')).toHaveTextContent('La situación cambió desde que empezó; vuelva a revisarla.')
    await waitFor(() => expect(localStorage.getItem(CLAVE)).toBeNull())
  })

  it('cancelar el descarte conserva banner y borrador; confirmar lo elimina', async () => {
    localStorage.setItem(CLAVE, JSON.stringify({ generacion: 'g1', etapa: 'resumen', recorrido: { respuestas: { a: { tipo: 'sigue' }, b: { tipo: 'sigue' } }, nueva: null, clasesEdificio: null }, asistenciaPedagogica: { brinda: '', modalidades: [] }, idsSituaciones: ['a', 'b'] }))
    stub(); montar()
    fireEvent.click(await screen.findByRole('button', { name: 'Descartar' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.getByRole('button', { name: 'Continuar donde lo dejé' })).toBeInTheDocument()
    expect(localStorage.getItem(CLAVE)).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, descartar' }))
    await waitFor(() => expect(localStorage.getItem(CLAVE)).toBeNull())
  })

  it('limpia la clave tras guardar con éxito y al cargar otra situación', async () => {
    stub(); montar(); await irAlResumen()
    await waitFor(() => expect(localStorage.getItem(CLAVE)).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Guardar actualización' }))
    await screen.findByText('Parte actualizado')
    await waitFor(() => expect(localStorage.getItem(CLAVE)).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar de nuevo' }))
    await screen.findByRole('button', { name: 'Actualizar el parte' })
    expect(localStorage.getItem(CLAVE)).toBeNull()
  })

  it('al volver con el historial del navegador desde resumen conserva las respuestas', async () => {
    stub(); montar(); await irAlResumen()
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
    const preguntaNueva = await screen.findByRole('group', { name: '¿Hay algo nuevo?' })
    expect(within(preguntaNueva).getByRole('radio', { name: 'No' })).toBeInTheDocument()
  })
})
