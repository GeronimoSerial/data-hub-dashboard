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
    expect(screen.getByText(/Sin alertas oficiales vigentes ni próximas para Corrientes/)).toBeInTheDocument()
    expect(screen.getByText(/Actualizado/)).toBeInTheDocument()
  })

  it('oculta la actualización cuando no hay fecha', () => {
    const { container } = render(<AlertasStrip alertas={[]} actualizado={null} />)
    expect(container.textContent).toContain('Sin alertas oficiales vigentes ni próximas para Corrientes · SMN')
    expect(container.querySelector('small')).not.toBeInTheDocument()
  })

  it('marca como próxima la alerta que todavía no empezó', () => {
    const { unmount } = render(<AlertasStrip alertas={[{ ...alerta, id: 'smn-2', onset: '2099-01-01T12:00:00Z', expires: '2099-01-02T12:00:00Z' }, alerta]} actualizado={null} />)
    expect(screen.getAllByText(/Próxima/)).toHaveLength(1)
    unmount()
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
