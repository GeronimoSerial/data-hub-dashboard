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
    ultimaCarga: { creadaEn: '2026-10-03T10:00:00.000Z', titulo: 'Se informó Sin energía o agua', cambios: ['Se informó Sin energía o agua', 'Gravedad Media'] },
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
  it('deja un solo Volver en datos y vuelve a la pregunta conservando la selección', async () => {
    stub()
    render(<RecorridoActualizacion cue={CUE} turnos={TURNOS_FIXTURE} motivos={MOTIVOS_FIXTURE} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Actualizar el parte' }))
    for (let i = 0; i < 2; i++) {
      fireEvent.click(screen.getByRole('radio', { name: 'Sigue igual' }))
      fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    }
    fireEvent.click(screen.getByRole('radio', { name: 'Sí, agregar una situación nueva' }))
    expect(screen.getAllByRole('button', { name: 'Volver' })).toHaveLength(1)
    fireEvent.click(screen.getByRole('radio', { name: /^Afecta al establecimiento/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Volver' }))
    expect(screen.getByRole('radio', { name: 'No' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'Sí, agregar una situación nueva' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(screen.getByRole('radio', { name: /^Afecta al establecimiento/ })).toBeChecked()
    fireEvent.click(screen.getByRole('radio', { name: 'Tormenta severa' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Alta' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Toda la escuela' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(screen.getByText('¿Se originó por alguna de estas situaciones?')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Volver' })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Volver' }))
    expect(screen.getByRole('radio', { name: 'Alta' })).toBeChecked()
    expect(screen.getAllByRole('button', { name: 'Volver' })).toHaveLength(1)
  })

  it('solucionar la causa pregunta por la consecuencia y envía un único POST', async () => {
    const fetchMock = stub()
    render(<RecorridoActualizacion cue={CUE} turnos={TURNOS_FIXTURE} motivos={MOTIVOS_FIXTURE} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Actualizar el parte' }))
    expect(screen.getByText('Paso 1 de 4')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Volver' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'Se solucionó' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sí, también se solucionó' }))
    expect(screen.getByRole('radio', { name: 'Ahora' })).toBeChecked()
    expect(screen.queryByRole('button', { name: 'Listo' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(screen.getByRole('heading', { level: 2, name: '¿Hay algo nuevo?' })).toBeInTheDocument()
    expect(screen.getByText('Paso 3 de 4')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'No' }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar actualización' }))
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
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Falta indicar cuándo se solucionó.')
    expect(document.activeElement).toBe(screen.getByLabelText('Fecha'))
    expect(screen.getByRole('region', { name: 'Situación 1 de 2' })).toBeInTheDocument()
  })

  it('no deja pasar al paso 2 con situaciones sin responder', async () => {
    stub()
    render(<RecorridoActualizacion cue={CUE} turnos={TURNOS_FIXTURE} motivos={MOTIVOS_FIXTURE} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Actualizar el parte' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Indique cómo sigue esta situación.')
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Sigue igual' }))
  })

  it('valida el alcance junto al selector y lo enfoca antes de avanzar', async () => {
    stub()
    render(<RecorridoActualizacion cue={CUE} turnos={TURNOS_FIXTURE} motivos={MOTIVOS_FIXTURE} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Actualizar el parte' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Cambió' }))
    const sheet = screen.getByRole('dialog')
    fireEvent.click(within(sheet).getByRole('checkbox', { name: 'A quién afecta (secciones / alumnos)' }))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Continuar' }))
    expect(screen.getByText('¿A quiénes afecta?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'Algunas secciones' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Elija a quién afecta esta situación.')
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Toda la escuela' }))
  })

  it('resume las situaciones sin cambios y muestra la asistencia vigente seleccionada', async () => {
    stub()
    render(<RecorridoActualizacion cue={CUE} turnos={TURNOS_FIXTURE} motivos={MOTIVOS_FIXTURE} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Actualizar el parte' }))
    for (let i = 0; i < 2; i++) {
      fireEvent.click(screen.getByRole('radio', { name: 'Sigue igual' }))
      fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    }
    fireEvent.click(screen.getByRole('radio', { name: 'No' }))
    expect(screen.getByRole('heading', { level: 2, name: 'Confirmar' })).toBeInTheDocument()
    expect(screen.getByText('Esto es lo que va a quedar informado. Revíselo antes de guardar.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Sin cambios' })).toBeInTheDocument()
    expect(screen.getByText('Inundación, Sin energía o agua')).toBeInTheDocument()
    expect(screen.queryByText(/Asistencia pedagógica: No/)).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'No' })).toBeChecked()
    expect(screen.queryByText('Actualmente: No')).not.toBeInTheDocument()
    expect(document.querySelector('.actualizacion-resumen__lista dl')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Volver' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar actualización' })).toBeInTheDocument()
  })

  it('resume una solución con fecha y hora legibles', async () => {
    stub()
    render(<RecorridoActualizacion cue={CUE} turnos={TURNOS_FIXTURE} motivos={MOTIVOS_FIXTURE} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Actualizar el parte' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Se solucionó' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sí, también se solucionó' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Otro día' }))
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-10-04' } })
    fireEvent.change(screen.getByLabelText('Hora'), { target: { value: '05:14' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    fireEvent.click(screen.getByRole('radio', { name: 'No' }))

    expect(screen.getByText('Se solucionó · 4 de octubre, 05:14')).toBeInTheDocument()
    expect(document.querySelector('.actualizacion-resumen__lista')?.textContent).not.toMatch(/2026-10-04T/)
  })

  it('describe la situación nueva antes de preguntar por su origen', async () => {
    const fetchMock = stub()
    render(<RecorridoActualizacion cue={CUE} turnos={TURNOS_FIXTURE} motivos={MOTIVOS_FIXTURE} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Actualizar el parte' }))
    for (let i = 0; i < 2; i++) {
      fireEvent.click(screen.getByRole('radio', { name: 'Sigue igual' }))
      fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    }
    fireEvent.click(screen.getByRole('radio', { name: 'Sí, agregar una situación nueva' }))
    expect(screen.getByText('¿Qué tipo de situación es?')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: '¿Se originó por alguna de estas situaciones?' })).not.toBeInTheDocument()
    elegirCategoriaEstablecimiento()
    fireEvent.click(screen.getByRole('radio', { name: 'Tormenta severa' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Alta' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Toda la escuela' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(screen.getByRole('group', { name: '¿Se originó por alguna de estas situaciones?' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: /^Inundación/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar actualización' }))
    const cuerpo = await cuerpoDelPost(fetchMock)
    expect(cuerpo.afectacionesNuevas[0]).toMatchObject({ motivo: 'Tormenta severa', severidad: 'Alta', causadaPorId: 'a' })
    expect(cuerpo.afectacionesConfirmadas.sort()).toEqual(['a', 'b'])
  })

  it('vuelve a revisar la situación al elegir actualizar el mismo motivo', async () => {
    const fetchMock = stub()
    render(<RecorridoActualizacion cue={CUE} turnos={TURNOS_FIXTURE} motivos={MOTIVOS_FIXTURE} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Actualizar el parte' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Sigue igual' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Sigue igual' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))

    fireEvent.click(screen.getByRole('radio', { name: 'Sí, agregar una situación nueva' }))
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
      fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    }
    fireEvent.click(screen.getByRole('radio', { name: 'Sí, agregar una situación nueva' }))
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
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar actualización' }))
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
