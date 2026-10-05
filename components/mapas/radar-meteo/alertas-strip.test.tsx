// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { AlertasStrip, type AlertaRadar } from './alertas-strip'

const alerta: AlertaRadar = {
  id: 'smn-1', nivelSat: null, severidad: 'moderada', evento: 'Tormentas',
  headline: 'Tormentas fuertes', description: 'Lluvias intensas en períodos cortos.',
  instruction: 'Seguí la información oficial.', onset: '2026-10-01T12:00:00Z',
  expires: '2026-10-01T18:00:00Z', departamentos: [{ id: '18021', nombre: 'Capital' }],
}

describe('franja de alertas oficiales', () => {
  it('muestra el estado vacío y última actualización', () => {
    render(<AlertasStrip alertas={[]} actualizado="2026-10-01T12:00:00Z" />)
    expect(screen.getByText(/Sin alertas oficiales vigentes para Corrientes/)).toBeInTheDocument()
    expect(screen.getByText(/Actualizado/)).toBeInTheDocument()
  })

  it('expande el texto oficial y mantiene severidad sin color SAT', () => {
    render(<AlertasStrip alertas={[alerta]} actualizado={null} />)
    const chip = screen.getByRole('button', { name: /Tormentas · moderada/ })
    expect(chip).not.toHaveClass('nivel-yellow')
    fireEvent.click(chip)
    expect(screen.getByText('Tormentas fuertes')).toBeInTheDocument()
    expect(screen.queryByText(/Fuente:/i)).not.toBeInTheDocument()
  })
})
