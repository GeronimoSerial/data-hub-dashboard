// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MOTIVOS_FIXTURE, TURNOS_FIXTURE } from '@/components/test-utils/parte-formulario'
import { RecorridoActualizacion } from './recorrido-actualizacion'

const CUE = '1801605-41'
function estadoActual() {
  return {
    ok: true,
    periodo: { id: 'p', nombre: 'ENOS' },
    parte: { id: 'parte', cueAnexo: CUE, estadoEstablecimiento: 'habitual', estadoEstablecimientoRigeDesde: '2026-10-02T10:00:00.000Z', actualizadaEn: '2026-10-03T10:00:00.000Z' },
    servicio: { estadoGeneral: 'normal', alcanceVigente: [] },
    afectaciones: [
      { id: 'a', motivo: 'Inundación', categoria: 'establecimiento', severidad: 'Crítica', descripcion: null, rigeDesde: '2026-10-02T10:00:00.000Z', creadaEn: '2026-10-02T10:00:00.000Z', causadaPorId: null, secciones: [], totales: { secciones: 0, alumnos: 0 } },
      { id: 'b', motivo: 'Sin energía o agua', categoria: 'establecimiento', severidad: 'Media', descripcion: null, rigeDesde: '2026-10-03T10:00:00.000Z', creadaEn: '2026-10-03T10:00:00.000Z', causadaPorId: 'a', secciones: [], totales: { secciones: 0, alumnos: 0 } },
    ],
    recientes: [],
    ultimaCarga: { creadaEn: '2026-10-03T10:00:00.000Z', cambios: ['Se agregó "Sin energía o agua" · Severidad Media'] },
  }
}

function stub(respuestaPost: Record<string, unknown> = { ok: true, movimientoId: 'm1' }) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (!init || init.method !== 'POST') {
      const body = url.includes('/historial') ? { ok: true, movimientos: [] } : estadoActual()
      return new Response(JSON.stringify(body), { status: 200 })
    }
    return new Response(JSON.stringify(respuestaPost), { status: 201 })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear() })

describe('RecorridoActualizacion', () => {
  it('solucionar la causa pregunta por la consecuencia y envía un único POST', async () => {
    const fetchMock = stub()
    render(<RecorridoActualizacion cue={CUE} turnos={TURNOS_FIXTURE} motivos={MOTIVOS_FIXTURE} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Actualizar el parte' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Se solucionó' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sí, también se solucionó' }))
    expect(screen.getByRole('radio', { name: 'Ahora' })).toBeChecked()
    expect(screen.queryByRole('button', { name: 'Listo' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(screen.getByText('¿Hay una situación nueva?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'No, no hay una situación nueva' }))
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))
    await waitFor(() => expect(fetchMock.mock.calls.filter(([, i]) => i?.method === 'POST')).toHaveLength(1))
    const [, init] = fetchMock.mock.calls.find(([, i]) => i?.method === 'POST')!
    const cuerpo = JSON.parse(init!.body as string)
    expect(cuerpo.afectacionesSolucionadas.map((s: { id: string }) => s.id).sort()).toEqual(['a', 'b'])
  })

  it('no avanza si se elige Otro día sin completar la fecha y la hora', async () => {
    stub()
    render(<RecorridoActualizacion cue={CUE} turnos={TURNOS_FIXTURE} motivos={MOTIVOS_FIXTURE} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Actualizar el parte' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Se solucionó' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sí, también se solucionó' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Otro día' }))
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Falta indicar cuándo se solucionó.')
    expect(document.activeElement).toBe(screen.getByLabelText('Fecha'))
    expect(screen.getByRole('region', { name: 'Situación 1 de 2' })).toBeInTheDocument()
  })

  it('no deja pasar al paso 2 con situaciones sin responder', async () => {
    stub()
    render(<RecorridoActualizacion cue={CUE} turnos={TURNOS_FIXTURE} motivos={MOTIVOS_FIXTURE} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Actualizar el parte' }))
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Indique cómo sigue esta situación.')
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Sigue igual' }))
  })

  it('resume las situaciones sin cambios y muestra la asistencia vigente seleccionada', async () => {
    stub()
    render(<RecorridoActualizacion cue={CUE} turnos={TURNOS_FIXTURE} motivos={MOTIVOS_FIXTURE} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Actualizar el parte' }))
    for (let i = 0; i < 2; i++) {
      fireEvent.click(screen.getByRole('radio', { name: 'Sigue igual' }))
      fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    }
    fireEvent.click(screen.getByRole('radio', { name: 'No, no hay una situación nueva' }))
    expect(screen.getByRole('heading', { name: 'Resumen' })).toBeInTheDocument()
    expect(screen.getByText('Situación Inundación: sin cambios')).toBeInTheDocument()
    expect(screen.getByText('Situación Sin energía o agua: sin cambios')).toBeInTheDocument()
    expect(screen.getByText('Asistencia pedagógica: No (vigente)')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'No' })).toBeChecked()
  })

  it('un problema nuevo siempre pregunta si es consecuencia de algo anterior', async () => {
    const fetchMock = stub()
    render(<RecorridoActualizacion cue={CUE} turnos={TURNOS_FIXTURE} motivos={MOTIVOS_FIXTURE} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Actualizar el parte' }))
    for (let i = 0; i < 2; i++) {
      fireEvent.click(screen.getByRole('radio', { name: 'Sigue igual' }))
      fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    }
    fireEvent.click(screen.getByRole('radio', { name: 'Sí, hay una situación nueva' }))
    expect(screen.getByText('¿Es consecuencia de algo anterior?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: /De Inundación/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    elegirCategoriaEstablecimiento()
    fireEvent.click(screen.getByRole('radio', { name: 'Tormenta severa' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Alta' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Toda la escuela' }))
    fireEvent.click(screen.getByRole('button', { name: 'Listo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))
    const cuerpo = await cuerpoDelPost(fetchMock)
    expect(cuerpo.afectacionesNuevas[0]).toMatchObject({ motivo: 'Tormenta severa', severidad: 'Alta', causadaPorId: 'a' })
    expect(cuerpo.afectacionesConfirmadas.sort()).toEqual(['a', 'b'])
  })

  it('vuelve a revisar la situación al elegir actualizar el mismo motivo', async () => {
    const fetchMock = stub()
    render(<RecorridoActualizacion cue={CUE} turnos={TURNOS_FIXTURE} motivos={MOTIVOS_FIXTURE} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Actualizar el parte' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Sigue igual' }))
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Sigue igual' }))
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))

    fireEvent.click(screen.getByRole('radio', { name: 'Sí, hay una situación nueva' }))
    fireEvent.click(screen.getByRole('radio', { name: 'No, es independiente' }))
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    elegirCategoriaEstablecimiento()
    fireEvent.click(screen.getByRole('radio', { name: 'Sin energía o agua' }))
    const sheet = screen.getByRole('dialog')
    fireEvent.click(within(sheet).getByRole('radio', { name: 'Sigue igual: es la misma, quiero actualizarla' }))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Continuar' }))

    expect(await screen.findByRole('heading', { name: /Sin energía o agua/ })).toBeInTheDocument()
    const cambió = screen.getByRole('radio', { name: 'Cambió' })
    expect(cambió).toBeEnabled()
    expect(cambió).not.toBeChecked()
    expect(screen.getByRole('radio', { name: 'Sigue igual' })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: 'Se solucionó' })).not.toBeChecked()
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0)
  })

  it('cargar un motivo igual a uno activo pregunta qué pasó con el anterior', async () => {
    const fetchMock = stub()
    render(<RecorridoActualizacion cue={CUE} turnos={TURNOS_FIXTURE} motivos={MOTIVOS_FIXTURE} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Actualizar el parte' }))
    for (let i = 0; i < 2; i++) {
      fireEvent.click(screen.getByRole('radio', { name: 'Sigue igual' }))
      fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    }
    fireEvent.click(screen.getByRole('radio', { name: 'Sí, hay una situación nueva' }))
    fireEvent.click(screen.getByRole('radio', { name: 'No, es independiente' }))
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    elegirCategoriaEstablecimiento()
    fireEvent.click(screen.getByRole('radio', { name: 'Sin energía o agua' }))
    const sheet = screen.getByRole('dialog')
    expect(within(sheet).getByText(/Ya tiene activa "Sin energía o agua" desde el/)).toBeInTheDocument()
    expect(within(sheet).getByRole('radio', { name: 'Sigue igual: es la misma, quiero actualizarla' })).toBeInTheDocument()
    expect(within(sheet).getByRole('radio', { name: 'Se solucionó y esto es una situación nueva' })).toBeInTheDocument()
    fireEvent.click(within(sheet).getByRole('radio', { name: 'Son dos situaciones distintas a la vez' }))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Continuar' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Media' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Toda la escuela' }))
    fireEvent.click(screen.getByRole('button', { name: 'Listo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))
    const cuerpo = await cuerpoDelPost(fetchMock)
    expect(cuerpo.afectacionesNuevas[0]).toMatchObject({ motivo: 'Sin energía o agua' })
    expect(cuerpo.afectacionesNuevas[0].causadaPorId).toBeUndefined()
    expect(cuerpo.afectacionesSolucionadas).toEqual([])
  })
})

function elegirCategoriaEstablecimiento() {
  fireEvent.click(screen.getByRole('radio', { name: /Afecta al establecimiento/ }))
  const sheet = screen.queryByRole('dialog')
  if (sheet) fireEvent.click(within(sheet).getByRole('button', { name: 'Continuar' }))
}

async function cuerpoDelPost(fetchMock: ReturnType<typeof vi.fn>) {
  await waitFor(() => expect(fetchMock.mock.calls.some(([, i]) => (i as RequestInit | undefined)?.method === 'POST')).toBe(true))
  const [, init] = fetchMock.mock.calls.find(([, i]) => (i as RequestInit | undefined)?.method === 'POST')!
  return JSON.parse((init as RequestInit).body as string)
}
