// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import type { EleccionVigencia } from '@/lib/infraestructura/vigencia-eleccion'
import { VigenciaChips } from './vigencia-chips'

afterEach(cleanup)

function Controlado({ label = '¿Desde cuándo ocurre?' }: { label?: string }) {
  const [v, setV] = useState<EleccionVigencia>({ modo: 'ahora' })
  return <VigenciaChips value={v} onChange={setV} label={label} />
}

describe('VigenciaChips', () => {
  it('arranca en "Ahora" sin campos de fecha ni hora', () => {
    render(<Controlado />)
    expect(screen.getByRole('radio', { name: 'Ahora' })).toBeChecked()
    const opciones = screen.getByRole('radiogroup', { name: '¿Desde cuándo ocurre?' })
    expect(opciones).toHaveClass('vigencia-chips__opciones')
    expect(within(opciones).getAllByRole('radio')).toHaveLength(3)
    expect(screen.queryByLabelText('Hora')).not.toBeInTheDocument()
    expect(screen.getByText('Desde ahora')).toBeInTheDocument()
  })

  it('"Hoy, más temprano" muestra sólo la hora', () => {
    render(<Controlado />)
    fireEvent.click(screen.getByRole('radio', { name: 'Hoy, más temprano' }))
    expect(screen.getByLabelText('Hora')).toBeInTheDocument()
    expect(screen.queryByLabelText('Fecha')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Hora'), { target: { value: '00:01' } })
    expect(screen.getByText('Desde hoy a las 00:01')).toBeInTheDocument()
  })

  it('"Otro día" muestra fecha y hora', () => {
    render(<Controlado />)
    fireEvent.click(screen.getByRole('radio', { name: 'Otro día' }))
    expect(screen.getByLabelText('Fecha')).toBeInTheDocument()
    expect(screen.getByLabelText('Hora')).toBeInTheDocument()
  })

  it('muestra el error recibido', () => {
    const mensaje = 'Esa hora todavía no pasó. Elija una hora anterior a la actual.'
    render(<VigenciaChips value={{ modo: 'hoy', hora: '23:59' }} onChange={() => {}} label="x" error={mensaje} />)
    const hora = screen.getByLabelText('Hora')
    expect(screen.getByRole('alert')).toHaveTextContent(mensaje)
    expect(hora).toHaveAttribute('aria-describedby', screen.getByRole('alert').id)
    expect(screen.getAllByText(mensaje)).toHaveLength(1)
  })

  it('sets the Argentine Spanish language on native date and time inputs', () => {
    render(<VigenciaChips value={{ modo: 'otro', fecha: '', hora: '' }} onChange={() => {}} label="Vigencia" />)

    expect(screen.getByLabelText('Fecha')).toHaveAttribute('lang', 'es-AR')
    expect(screen.getByLabelText('Hora')).toHaveAttribute('lang', 'es-AR')
  })

  it('sets the Argentine Spanish language on the date input for a resolved situation', () => {
    render(<Controlado label="¿Cuándo se solucionó?" />)
    fireEvent.click(within(screen.getByRole('radiogroup', { name: '¿Cuándo se solucionó?' })).getByLabelText('Otro día'))

    expect(screen.getByLabelText('Fecha')).toHaveAttribute('lang', 'es-AR')
    expect(screen.getByLabelText('Hora')).toHaveAttribute('lang', 'es-AR')
  })
})
