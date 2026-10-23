// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MOTIVOS_FIXTURE, TURNOS_FIXTURE } from '@/components/test-utils/parte-formulario'
import { RECORRIDO_INICIAL, type SituacionRecorrido } from '@/lib/infraestructura/parte/recorrido-actualizacion'
import { AlgoNuevo } from './algo-nuevo'

beforeEach(() => {
  vi.setSystemTime(new Date('2026-10-05T12:00:00.000Z'))
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const candidatasCausa = [
  { id: 'reciente', motivo: 'Tormenta severa', fecha: '2026-10-04T08:10:00.000Z', activa: false, severidad: 'Alta' as const },
  { id: 'situacion-1', motivo: 'Inundación', fecha: '2026-10-03T10:00:00.000Z', activa: true, severidad: 'Alta' as const, secciones: 5, alumnos: 107 },
]

const situacionActiva: SituacionRecorrido = {
  id: 'situacion-1',
  motivo: 'Inundación',
  categoria: 'establecimiento',
  severidad: 'Alta',
  rigeDesde: '2026-10-03T10:00:00.000Z',
  creadaEn: '2026-10-03T10:00:00.000Z',
  causadaPorId: null,
}

function renderAlgo(overrides: Partial<React.ComponentProps<typeof AlgoNuevo>> = {}) {
  const callbacks = {
    onTerminar: vi.fn(),
    onActualizarExistente: vi.fn(),
    onSolucionarExistente: vi.fn(),
  }
  render(
    <AlgoNuevo
      candidatasCausa={candidatasCausa}
      situacionesActivas={[situacionActiva]}
      estado={RECORRIDO_INICIAL}
      turnos={TURNOS_FIXTURE}
      motivos={MOTIVOS_FIXTURE}
      {...callbacks}
      {...overrides}
    />,
  )
  return callbacks
}

function entrarDatosIndependiente() {
  fireEvent.click(screen.getByRole('radio', { name: 'Sí, agregar una situación nueva' }))
}

function completarDatosNueva(motivo = 'Tormenta severa') {
  elegirCategoria('Afecta al establecimiento')
  fireEvent.click(screen.getByRole('radio', { name: motivo }))
  fireEvent.click(screen.getByRole('radio', { name: 'Alta' }))
  fireEvent.click(screen.getByRole('radio', { name: 'Toda la escuela' }))
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
}

function elegirCategoria(nombre: string) {
  fireEvent.click(screen.getByRole('radio', { name: new RegExp(`^${nombre}`) }))
  const sheet = screen.queryByRole('dialog')
  if (sheet) fireEvent.click(within(sheet).getByRole('button', { name: 'Continuar' }))
}

describe('AlgoNuevo', () => {
  it('la pregunta de situación nueva usa un título propio y opciones breves', () => {
    renderAlgo()
    expect(screen.getByRole('heading', { name: '¿Hay algo nuevo?' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: '¿Hay algo nuevo?' })).toBeInTheDocument()
    expect(screen.getAllByText('¿Hay algo nuevo?')).toHaveLength(1)
    expect(screen.queryByText('¿Hay una situación nueva?')).not.toBeInTheDocument()
    expect(screen.queryByText('Agregue una situación nueva si la hay.')).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'No' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Sí, agregar una situación nueva' })).toBeInTheDocument()
  })

  it('pregunta a quiénes afecta la situación nueva y conserva la descripción opcional', () => {
    renderAlgo()
    entrarDatosIndependiente()
    elegirCategoria('Afecta al establecimiento')

    expect(screen.getByRole('heading', { name: '¿A quiénes afecta?' })).toBeInTheDocument()
    expect(screen.queryByText('Alcance')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Descripción (opcional)')).toBeInTheDocument()
  })

  it('restaura una situación Superior guardada y permite corregir su carrera obsoleta', () => {
    const estado = {
      ...RECORRIDO_INICIAL,
      nueva: {
        causadaPorId: null,
        motivo: 'Tormenta severa',
        severidad: 'Alta' as const,
        secciones: [],
        carreras: ['Carrera cerrada'],
      },
    }
    renderAlgo({ estado, carreras: ['Tecnicatura A'] })

    expect(screen.getByRole('heading', { name: '¿Qué pasó?' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Inaccesibilidad de alumnos/ })).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('Carrera cerrada')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Carrera cerrada (ya no disponible)' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Tecnicatura A' }))

    expect(screen.getByText('1 carrera seleccionada')).toBeInTheDocument()
  })

  it('organiza los datos en los dos bloques del asistente', () => {
    renderAlgo()
    entrarDatosIndependiente()

    expect(screen.getByRole('heading', { name: '¿Qué pasó?' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '¿A quiénes afecta?' })).toBeInTheDocument()
    expect(screen.getByLabelText('Descripción (opcional)').closest('.asistente__cuerpo'))
      .toBe(screen.getByRole('heading', { name: '¿Qué pasó?' }).parentElement)
  })

  it('cambia el título según la etapa y notifica cada transición', () => {
    const onEtapaChange = vi.fn()
    renderAlgo({ onEtapaChange })
    expect(screen.getByRole('heading', { name: '¿Hay algo nuevo?' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'Sí, agregar una situación nueva' }))
    expect(screen.getByRole('heading', { name: 'Situación nueva' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '¿Hay algo nuevo?' })).not.toBeInTheDocument()
    expect(onEtapaChange).toHaveBeenLastCalledWith('datos')
    fireEvent.click(screen.getByRole('button', { name: 'Volver' }))
    expect(onEtapaChange).toHaveBeenLastCalledWith('pregunta')
  })

  it('muestra el contador de secciones seleccionadas en cero, singular y plural', () => {
    renderAlgo()
    entrarDatosIndependiente()
    expect(screen.getByText('Ninguna sección seleccionada')).toHaveAttribute('aria-live', 'polite')

    fireEvent.click(screen.getByRole('checkbox', { name: /1° "A"/ }))
    expect(screen.getByText('1 sección seleccionada')).toHaveAttribute('aria-live', 'polite')

    fireEvent.click(screen.getByRole('checkbox', { name: /1° "B"/ }))
    expect(screen.getByText('2 secciones seleccionadas')).toHaveAttribute('aria-live', 'polite')
  })

  it('explica los datos faltantes y asocia el mensaje al botón Continuar', () => {
    renderAlgo()
    entrarDatosIndependiente()

    const continuar = screen.getByRole('button', { name: 'Continuar' })
    let faltantes = screen.getByText('Elija el tipo, el motivo, la gravedad y al menos una sección.')
    expect(continuar).toBeDisabled()
    expect(continuar).toHaveAttribute('aria-describedby', faltantes.id)

    elegirCategoria('Afecta al establecimiento')
    faltantes = screen.getByText('Elija el motivo, la gravedad y el alcance del establecimiento.')
    expect(continuar).toHaveAttribute('aria-describedby', faltantes.id)

    fireEvent.click(screen.getByRole('radio', { name: 'Tormenta severa' }))
    faltantes = screen.getByText('Elija la gravedad y el alcance del establecimiento.')
    fireEvent.click(screen.getByRole('radio', { name: 'Alta' }))
    faltantes = screen.getByText('Elija el alcance del establecimiento.')
    fireEvent.click(screen.getByRole('radio', { name: 'Algunas secciones' }))
    faltantes = screen.getByText('Elija al menos una sección.')
    fireEvent.click(screen.getByRole('checkbox', { name: /1° "A"/ }))
    expect(screen.queryByText(/Elija /)).not.toBeInTheDocument()
    expect(continuar).not.toHaveAttribute('aria-describedby')
    expect(continuar).toBeEnabled()
  })

  it('“No” termina sin agregar una situación', () => {
    const callbacks = renderAlgo()
    fireEvent.click(screen.getByRole('radio', { name: 'No' }))
    expect(callbacks.onTerminar).toHaveBeenCalledWith(null)
  })

  it('muestra los datos antes de preguntar por el origen y conserva el borrador al volver', () => {
    const callbacks = renderAlgo()
    fireEvent.click(screen.getByRole('radio', { name: 'Sí, agregar una situación nueva' }))
    expect(screen.getByText('¿Qué tipo de situación es?')).toBeInTheDocument()
    expect(screen.queryByText('¿Se originó por alguna de estas situaciones?')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Volver' }))
    expect(screen.getByRole('radio', { name: 'Sí, agregar una situación nueva' })).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    completarDatosNueva()
    const pregunta = '¿Se originó por alguna de estas situaciones?'
    expect(screen.getByText(pregunta)).toBeInTheDocument()
    const opciones = within(screen.getByRole('group', { name: pregunta })).getAllByRole('radio')
    expect(opciones.map((radio) => radio.parentElement?.textContent?.trim())).toEqual([
      'No, es independiente',
      'InundaciónAlta · 5 secciones, 107 alumnos · desde 3 de octubre 07:00',
    ])
    expect(screen.getByRole('radio', { name: /Inundación · Alta · 5 secciones, 107 alumnos · desde 3 de octubre 07:00/ })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'No, es independiente' })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(callbacks.onTerminar).toHaveBeenCalledWith(expect.objectContaining({ causadaPorId: null }))
  })

  it('muestra las causas cerradas en grupos de cinco', () => {
    const candidatas = Array.from({ length: 22 }, (_, indice) => ({
      id: `situacion-${indice}`,
      motivo: `Situación ${indice}`,
      fecha: new Date(2026, 9, 5, 12, indice).toISOString(),
      activa: indice < 2,
    }))
    renderAlgo({ candidatasCausa: candidatas })
    fireEvent.click(screen.getByRole('radio', { name: 'Sí, agregar una situación nueva' }))
    completarDatosNueva()

    const grupo = screen.getByRole('group', { name: '¿Se originó por alguna de estas situaciones?' })
    expect(within(grupo).getAllByRole('radio')).toHaveLength(3)
    expect(screen.getByRole('button', { name: 'Ver anteriores (20)' })).toHaveAttribute('aria-haspopup', 'dialog')
    fireEvent.click(screen.getByRole('button', { name: 'Ver anteriores (20)' }))
    const panel = screen.getByRole('dialog', { name: 'Situaciones anteriores' })
    const anteriores = within(panel).getAllByRole('radio')
    expect(anteriores).toHaveLength(20)
    fireEvent.click(anteriores[0])
    expect(screen.queryByRole('dialog', { name: 'Situaciones anteriores' })).not.toBeInTheDocument()
    expect(within(grupo).getAllByRole('radio')).toHaveLength(4)
    expect(within(grupo).getAllByRole('radio')[3]).toBeChecked()
  })

  it('termina los datos directamente cuando no hay candidatas de causa', () => {
    const callbacks = renderAlgo({ candidatasCausa: [] })
    fireEvent.click(screen.getByRole('radio', { name: 'Sí, agregar una situación nueva' }))
    completarDatosNueva()
    expect(screen.queryByText('¿Se originó por alguna de estas situaciones?')).not.toBeInTheDocument()
    expect(callbacks.onTerminar).toHaveBeenCalledWith(expect.objectContaining({ causadaPorId: null }))
  })

  it('si sólo hay causas cerradas, muestra independencia y permite verlas aparte', () => {
    renderAlgo({ candidatasCausa: [candidatasCausa[0]], situacionesActivas: [] })
    entrarDatosIndependiente()
    completarDatosNueva()

    const grupo = screen.getByRole('group', { name: '¿Se originó por alguna de estas situaciones?' })
    expect(within(grupo).getAllByRole('radio')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Ver anteriores (1)' })).toHaveAttribute('aria-haspopup', 'dialog')
    fireEvent.click(screen.getByRole('button', { name: 'Ver anteriores (1)' }))
    const panel = screen.getByRole('dialog', { name: 'Situaciones anteriores' })
    expect(within(panel).getByRole('radio', { name: /Tormenta severa · Alta · desde (ayer|4 de octubre) 05:10 · Solucionada/ })).toBeInTheDocument()
  })

  it('permite distinguir el mismo motivo, actualizarlo o marcar cuándo se solucionó', () => {
    const callbacks = renderAlgo()
    entrarDatosIndependiente()
    elegirCategoria('Afecta al establecimiento')
    fireEvent.click(screen.getByRole('radio', { name: 'Inundación' }))

    const sheet = screen.getByRole('dialog')
    expect(within(sheet).getByText('Ya tiene activa "Inundación" desde el 3 de octubre. ¿Qué pasó con esa?')).toBeInTheDocument()
    fireEvent.click(within(sheet).getByRole('radio', { name: 'Son dos situaciones distintas a la vez' }))
    expect(within(sheet).getByRole('button', { name: 'Continuar' })).toBeEnabled()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Continuar' }))
    expect(screen.getByRole('radio', { name: 'Inundación' })).toBeChecked()
    expect(callbacks.onTerminar).not.toHaveBeenCalled()

    cleanup()
    const callbacksActualizar = renderAlgo()
    entrarDatosIndependiente()
    elegirCategoria('Afecta al establecimiento')
    fireEvent.click(screen.getByRole('radio', { name: 'Inundación' }))
    const sheetActualizar = screen.getByRole('dialog')
    fireEvent.click(within(sheetActualizar).getByRole('radio', { name: 'Sigue igual: es la misma, quiero actualizarla' }))
    fireEvent.click(within(sheetActualizar).getByRole('button', { name: 'Continuar' }))
    expect(callbacksActualizar.onActualizarExistente).toHaveBeenCalledWith('situacion-1')

    cleanup()
    const callbacksSolucionar = renderAlgo()
    entrarDatosIndependiente()
    elegirCategoria('Afecta al establecimiento')
    fireEvent.click(screen.getByRole('radio', { name: 'Inundación' }))
    const sheetSolucionar = screen.getByRole('dialog')
    fireEvent.click(within(sheetSolucionar).getByRole('radio', { name: 'Se solucionó y esto es una situación nueva' }))
    expect(within(sheetSolucionar).getByText('¿Cuándo se solucionó?')).toBeInTheDocument()
    fireEvent.click(within(sheetSolucionar).getByRole('button', { name: 'Continuar' }))
    expect(callbacksSolucionar.onSolucionarExistente).toHaveBeenCalledWith('situacion-1', expect.any(String))
  })

  it('cancelar la confirmación del motivo conserva la elección anterior y no llama callbacks', () => {
    const callbacks = renderAlgo()
    entrarDatosIndependiente()
    elegirCategoria('Afecta al establecimiento')
    fireEvent.click(screen.getByRole('radio', { name: 'Tormenta severa' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Inundación' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }))
    expect(screen.getByRole('radio', { name: 'Tormenta severa' })).toBeChecked()
    expect(callbacks.onTerminar).not.toHaveBeenCalled()
    expect(callbacks.onActualizarExistente).not.toHaveBeenCalled()
    expect(callbacks.onSolucionarExistente).not.toHaveBeenCalled()
  })

  it('cancelar la confirmación de categoría conserva la categoría anterior', () => {
    renderAlgo()
    entrarDatosIndependiente()
    elegirCategoria('Afecta al establecimiento')
    fireEvent.click(screen.getByRole('radio', { name: /^Inaccesibilidad de alumnos/ }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Elegir otra' }))
    expect(screen.getByRole('radio', { name: /^Afecta al establecimiento/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /^Inaccesibilidad de alumnos/ })).not.toBeChecked()
  })

  it('“Continuar” envía la nueva situación completa con la causa elegida', () => {
    const callbacks = renderAlgo()
    fireEvent.click(screen.getByRole('radio', { name: 'Sí, agregar una situación nueva' }))
    elegirCategoria('Afecta al establecimiento')
    fireEvent.click(screen.getByRole('radio', { name: 'Tormenta severa' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Alta' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Toda la escuela' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    fireEvent.click(screen.getByRole('radio', { name: /Inundación · Alta · 5 secciones/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(callbacks.onTerminar).toHaveBeenCalledWith({
      causadaPorId: 'situacion-1',
      motivo: 'Tormenta severa',
      severidad: 'Alta',
      secciones: [10, 11, 20],
    })
  })

  it('incluye alumnos sólo cuando la categoría es inaccesibilidad de alumnos', () => {
    const callbacks = renderAlgo()
    entrarDatosIndependiente()
    elegirCategoria('Inaccesibilidad de alumnos')
    fireEvent.click(screen.getByRole('radio', { name: 'Anegamiento' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Baja' }))
    fireEvent.click(screen.getByRole('button', { name: /1° "A".*elegir alumnos/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'García, Ana' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(callbacks.onTerminar).toHaveBeenCalledWith({
      causadaPorId: null,
      motivo: 'Anegamiento',
      severidad: 'Baja',
      secciones: [10],
      alumnos: [1001],
    })
  })
})
