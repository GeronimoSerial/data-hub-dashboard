// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CamposClasesEdificio, type ValorClasesEdificio } from './campos-clases-edificio'

function Controlado({ alcanceParcial = false, onInterrumpir = vi.fn() }: { alcanceParcial?: boolean; onInterrumpir?: () => void }) {
  const [v, setV] = useState<ValorClasesEdificio>({ servicioEstado: '', estadoEstablecimiento: '' })
  return (
    <>
      <CamposClasesEdificio valor={v} onCambiar={setV} alcanceParcial={alcanceParcial} onInterrumpirTodaLaEscuela={onInterrumpir} />
      <output data-testid="v">{JSON.stringify(v)}</output>
    </>
  )
}
const v = () => JSON.parse(screen.getByTestId('v').textContent!)

afterEach(cleanup)

describe('CamposClasesEdificio', () => {
  it('no usa la palabra "funcionamiento"', () => {
    render(<Controlado />)
    expect(screen.queryByText(/funcionamiento/i)).not.toBeInTheDocument()
    expect(screen.getByText('¿Hay clases?')).toBeInTheDocument()
    expect(screen.getByText('¿Cómo está el edificio?')).toBeInTheDocument()
  })
  it('Evacuado fuerza "No, se suspendieron" y bloquea la pregunta de clases', () => {
    render(<Controlado />)
    fireEvent.click(screen.getByRole('radio', { name: 'Sí, con normalidad' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Evacuado' }))
    expect(v()).toEqual({ servicioEstado: 'suspendido', estadoEstablecimiento: 'evacuado' })
    expect(screen.getByRole('radio', { name: 'Sí, con normalidad' })).toBeDisabled()
    expect(screen.getByText('El edificio está evacuado')).toBeInTheDocument()
  })
  it('con alcance parcial, evacuar pide confirmación; cancelar no aplica', () => {
    const onInterrumpir = vi.fn()
    render(<Controlado alcanceParcial onInterrumpir={onInterrumpir} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Evacuado' }))
    const dialogo = screen.getByRole('dialog')
    expect(within(dialogo).getByText(/interrumpe toda la escuela/)).toBeInTheDocument()
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))
    expect(v().estadoEstablecimiento).toBe('')
    expect(onInterrumpir).not.toHaveBeenCalled()
  })
  it('confirmar la interrupción aplica el estado y pide pasar a toda la escuela', () => {
    const onInterrumpir = vi.fn()
    render(<Controlado alcanceParcial onInterrumpir={onInterrumpir} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Usado como centro de evacuados' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sí, toda la escuela' }))
    expect(onInterrumpir).toHaveBeenCalledTimes(1)
    expect(v().estadoEstablecimiento).toBe('centro_evacuados')
  })
})
