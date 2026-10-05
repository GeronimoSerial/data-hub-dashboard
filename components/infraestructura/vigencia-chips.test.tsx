// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import type { EleccionVigencia } from '@/lib/infraestructura/vigencia-eleccion'
import { VigenciaChips } from './vigencia-chips'

afterEach(cleanup)

function Controlado() {
  const [v, setV] = useState<EleccionVigencia>({ modo: 'ahora' })
  return <VigenciaChips value={v} onChange={setV} label="¿Desde cuándo ocurre?" />
}

describe('VigenciaChips', () => {
  it('arranca en "Ahora" sin campos de fecha ni hora', () => {
    render(<Controlado />)
    expect(screen.getByRole('radio', { name: 'Ahora' })).toBeChecked()
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
    render(<VigenciaChips value={{ modo: 'ahora' }} onChange={() => {}} label="x" error="La fecha debe estar entre hace 12 meses y el momento actual." />)
    expect(screen.getByRole('alert')).toHaveTextContent('12 meses')
  })
})
