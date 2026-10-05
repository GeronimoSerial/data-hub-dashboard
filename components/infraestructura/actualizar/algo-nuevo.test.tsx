// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MOTIVOS_FIXTURE, TURNOS_FIXTURE } from '@/components/test-utils/parte-formulario'
import { RECORRIDO_INICIAL, type SituacionRecorrido } from '@/lib/infraestructura/parte/recorrido-actualizacion'
import { AlgoNuevo } from './algo-nuevo'

afterEach(cleanup)

const candidatasCausa = [
  { id: 'reciente', motivo: 'Tormenta severa', fecha: '2026-10-04T08:10:00.000Z', activa: false },
  { id: 'situacion-1', motivo: 'Inundación', fecha: '2026-10-03T10:00:00.000Z', activa: true },
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
  fireEvent.click(screen.getByRole('radio', { name: 'No, es independiente' }))
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
}

function elegirCategoria(nombre: string) {
  fireEvent.click(screen.getByRole('radio', { name: new RegExp(`^${nombre}`) }))
  const sheet = screen.queryByRole('dialog')
  if (sheet) fireEvent.click(within(sheet).getByRole('button', { name: 'Continuar' }))
}

describe('AlgoNuevo', () => {
  it('la pregunta de situación nueva usa un título propio y opciones breves', () => {
    renderAlgo()
    expect(screen.getByText('Otra situación')).toBeInTheDocument()
    expect(screen.queryByText('Agregue una situación nueva si la hay.')).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'No' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Sí, agregar una situación nueva' })).toBeInTheDocument()
  })

  it('“No” termina sin agregar una situación', () => {
    const callbacks = renderAlgo()
    fireEvent.click(screen.getByRole('radio', { name: 'No' }))
    expect(callbacks.onTerminar).toHaveBeenCalledWith(null)
  })

  it('pregunta por el origen, muestra independencia primero y exige elegir antes de seguir', () => {
    renderAlgo()
    fireEvent.click(screen.getByRole('radio', { name: 'Sí, agregar una situación nueva' }))
    const pregunta = '¿Esta situación se originó por otra anterior?'
    expect(screen.getByText(pregunta)).toBeInTheDocument()
    const opciones = within(screen.getByRole('group', { name: pregunta })).getAllByRole('radio')
    expect(opciones.map((radio) => radio.parentElement?.textContent?.trim())).toEqual([
      'No, es independiente',
      'Inundación · 3 de octubre a las 07:00Activa',
      'Tormenta severa · 4 de octubre a las 05:10Solucionada',
    ])
    expect(screen.getByRole('radio', { name: /Inundación · 3 de octubre a las 07:00/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled()
    fireEvent.click(screen.getByRole('radio', { name: 'No, es independiente' }))
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
  })

  it('muestra cinco causas y despliega las restantes con su cantidad', () => {
    const candidatas = Array.from({ length: 8 }, (_, indice) => ({
      id: `situacion-${indice}`,
      motivo: `Situación ${indice}`,
      fecha: `2026-10-0${5 - Math.floor(indice / 2)}T0${indice % 2}:00:00.000Z`,
      activa: indice < 6,
    }))
    renderAlgo({ candidatasCausa: candidatas })
    fireEvent.click(screen.getByRole('radio', { name: 'Sí, agregar una situación nueva' }))

    const grupo = screen.getByRole('group', { name: '¿Esta situación se originó por otra anterior?' })
    expect(within(grupo).getAllByRole('radio')).toHaveLength(6)
    expect(screen.getByRole('button', { name: 'Ver más (3)' })).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'Ver más (3)' }))
    expect(within(grupo).getAllByRole('radio')).toHaveLength(9)
    expect(screen.queryByRole('button', { name: /Ver más/ })).not.toBeInTheDocument()
  })

  it('permite distinguir el mismo motivo, actualizarlo o marcar cuándo se solucionó', () => {
    const callbacks = renderAlgo()
    entrarDatosIndependiente()
    elegirCategoria('Afecta al establecimiento')
    fireEvent.click(screen.getByRole('radio', { name: 'Inundación' }))

    const sheet = screen.getByRole('dialog')
    expect(within(sheet).getByText('Ya tiene activa "Inundación" desde el 03/10/2026. ¿Qué pasó con esa?')).toBeInTheDocument()
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

  it('“Listo” envía la nueva situación completa con la causa elegida', () => {
    const callbacks = renderAlgo()
    fireEvent.click(screen.getByRole('radio', { name: 'Sí, agregar una situación nueva' }))
    fireEvent.click(screen.getByRole('radio', { name: /Inundación · 3 de octubre a las 07:00/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    elegirCategoria('Afecta al establecimiento')
    fireEvent.click(screen.getByRole('radio', { name: 'Tormenta severa' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Alta' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Toda la escuela' }))
    fireEvent.click(screen.getByRole('button', { name: 'Listo' }))
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
    fireEvent.click(screen.getByRole('button', { name: 'Listo' }))
    expect(callbacks.onTerminar).toHaveBeenCalledWith({
      causadaPorId: null,
      motivo: 'Anegamiento',
      severidad: 'Baja',
      secciones: [10],
      alumnos: [1001],
    })
  })
})
