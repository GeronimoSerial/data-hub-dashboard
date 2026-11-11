// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EleccionVigencia } from '@/lib/infraestructura/vigencia-eleccion'
import { VigenciaChips } from './vigencia-chips'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function Controlado({ label = '¿Desde cuándo ocurre?', etiquetaMomento }: { label?: string; etiquetaMomento?: string }) {
  const [v, setV] = useState<EleccionVigencia>({ modo: 'ahora' })
  return <VigenciaChips value={v} onChange={setV} label={label} etiquetaMomento={etiquetaMomento} />
}

describe('VigenciaChips', () => {
  it('arranca en "Ahora" sin campos de fecha ni hora', () => {
    render(<Controlado />)
    expect(screen.getByRole('radio', { name: 'Ahora' })).toBeChecked()
    const opciones = screen.getByRole('radiogroup', { name: '¿Desde cuándo ocurre?' })
    expect(opciones).toHaveClass('vigencia-chips__opciones')
    expect(within(opciones).getAllByRole('radio')).toHaveLength(3)
    expect(screen.queryByLabelText('Hora')).not.toBeInTheDocument()
    expect(screen.queryByText('Desde ahora')).not.toBeInTheDocument()
  })

  it('no repite el momento actual cuando ya está elegido en el chip', () => {
    render(<Controlado label="¿Cuándo se solucionó?" etiquetaMomento="Se solucionó" />)
    expect(screen.getByRole('radio', { name: 'Ahora' })).toBeChecked()
    expect(screen.queryByText('Se solucionó ahora')).not.toBeInTheDocument()
  })

  it('describe la hora y la fecha con el verbo elegido', () => {
    render(<VigenciaChips value={{ modo: 'hoy', hora: '05:14' }} onChange={() => {}} label="Solución" etiquetaMomento="Se solucionó" />)
    expect(screen.getByText('Se solucionó hoy a las 05:14')).toBeInTheDocument()
    cleanup()
    render(<VigenciaChips value={{ modo: 'otro', fecha: '2026-10-04', hora: '05:14' }} onChange={() => {}} label="Solución" etiquetaMomento="Se solucionó" />)
    expect(screen.getByText('Se solucionó el dom 04/10 a las 05:14')).toBeInTheDocument()
  })

  it('"Hoy, más temprano" muestra sólo la hora', () => {
    render(<Controlado />)
    fireEvent.click(screen.getByRole('radio', { name: 'Hoy, más temprano' }))
    expect(screen.getByLabelText('Hora')).toBeInTheDocument()
    expect(screen.queryByLabelText('Fecha')).not.toBeInTheDocument()
    expect(screen.queryByText('Elija la fecha y la hora')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Hora'), { target: { value: '00:01' } })
    expect(screen.getByText('Desde hoy a las 00:01')).toBeInTheDocument()
  })

  it('"Otro día" muestra fecha y hora', () => {
    render(<Controlado />)
    fireEvent.click(screen.getByRole('radio', { name: 'Otro día' }))
    expect(screen.getByLabelText('Fecha')).toBeInTheDocument()
    expect(screen.getByLabelText('Hora')).toBeInTheDocument()
    expect(screen.queryByText('Elija la fecha y la hora')).not.toBeInTheDocument()
  })

  it('no repite la indicación si todavía falta la fecha de "Otro día"', () => {
    render(<VigenciaChips value={{ modo: 'otro', fecha: '', hora: '08:00' }} onChange={() => {}} label="Vigencia" />)
    expect(screen.getByLabelText('Fecha')).toBeInTheDocument()
    expect(screen.getByLabelText('Hora')).toBeInTheDocument()
    expect(screen.queryByText('Elija la fecha y la hora')).not.toBeInTheDocument()
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

  it('limits the date to the supplied situation start without changing the default range', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-10T13:00:00.000Z'))
    render(<VigenciaChips value={{ modo: 'otro', fecha: '', hora: '' }} onChange={() => {}} label="Solución" minimo="2026-10-26T14:17:33.698Z" />)
    expect(screen.getByLabelText('Fecha')).toHaveAttribute('min', '2026-10-26')
    cleanup()
    render(<VigenciaChips value={{ modo: 'otro', fecha: '', hora: '' }} onChange={() => {}} label="Inicio" />)
    expect(Date.parse(screen.getByLabelText('Fecha').getAttribute('min')!)).toBeLessThan(Date.parse('2026-10-26'))
  })

  it('sets the Argentine Spanish language on the date input for a resolved situation', () => {
    render(<Controlado label="¿Cuándo se solucionó?" />)
    fireEvent.click(within(screen.getByRole('radiogroup', { name: '¿Cuándo se solucionó?' })).getByLabelText('Otro día'))

    expect(screen.getByLabelText('Fecha')).toHaveAttribute('lang', 'es-AR')
    expect(screen.getByLabelText('Hora')).toHaveAttribute('lang', 'es-AR')
  })
})
