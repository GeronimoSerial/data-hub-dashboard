// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { CampoGravedad, type ValorGravedad } from './campo-gravedad'
import type { Severidad } from '@/lib/infraestructura/validacion'

function Controlado({ sugerida, categoria = 'establecimiento' }: { sugerida: Severidad | null; categoria?: 'establecimiento' | 'alumnos' }) {
  const [v, setV] = useState<ValorGravedad>({ severidad: '', justificacionCritica: '', justificacionCriticaDetalle: '' })
  return (
    <>
      <CampoGravedad idPrefijo="t" categoria={categoria} sugerida={sugerida} valor={v} onCambiar={setV} />
      <output data-testid="valor">{JSON.stringify(v)}</output>
    </>
  )
}
const valor = () => JSON.parse(screen.getByTestId('valor').textContent!)

afterEach(cleanup)

describe('CampoGravedad', () => {
  it('muestra los 4 niveles y marca el sugerido sin preseleccionarlo', () => {
    render(<Controlado sugerida="Alta" />)
    expect(screen.getAllByRole('radio')).toHaveLength(4)
    expect(within(screen.getByText('Alta').closest('label')!).getByText('Sugerido')).toBeInTheDocument()
    expect(screen.getAllByRole('radio').every((r) => !(r as HTMLInputElement).checked)).toBe(true)
  })

  it('usa los criterios de la categoría', () => {
    render(<Controlado sugerida={null} categoria="alumnos" />)
    expect(screen.getByText('Llegan con demora o dificultad, pero asisten.')).toBeInTheDocument()
  })

  it('Crítica no sugerida abre el sheet y sólo se aplica al confirmar con una razón', () => {
    render(<Controlado sugerida="Media" />)
    fireEvent.click(screen.getByRole('radio', { name: 'Crítica' }))
    expect(screen.getByText('¿Por qué es crítica?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled()
    fireEvent.click(screen.getByRole('radio', { name: 'Hay riesgo eléctrico, estructural o sanitario' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    expect(valor()).toEqual({ severidad: 'Crítica', justificacionCritica: 'riesgo_fisico', justificacionCriticaDetalle: '' })
  })

  it('usa situación en la justificación de gravedad crítica', () => {
    render(<Controlado sugerida="Media" />)
    fireEvent.click(screen.getByRole('radio', { name: 'Crítica' }))
    expect(screen.getByRole('radio', { name: 'Se combina con otra situación activa' })).toBeInTheDocument()
  })

  it('"Otro" exige detalle', () => {
    render(<Controlado sugerida="Media" />)
    fireEvent.click(screen.getByRole('radio', { name: 'Crítica' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Otro' }))
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled()
    const descripcion = screen.getByLabelText('Describa qué pasa')
    expect(descripcion.closest('label')).toHaveClass('afectacion-campos__detalle')
    fireEvent.change(descripcion, { target: { value: 'Cayó un árbol sobre el aula' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    expect(valor().justificacionCriticaDetalle).toBe('Cayó un árbol sobre el aula')
  })

  it('cancelar el sheet deja la gravedad anterior', () => {
    render(<Controlado sugerida="Media" />)
    fireEvent.click(screen.getByRole('radio', { name: 'Media' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Crítica' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(valor().severidad).toBe('Media')
  })

  it('Crítica sugerida no pide justificación', () => {
    render(<Controlado sugerida="Crítica" />)
    fireEvent.click(screen.getByRole('radio', { name: 'Crítica' }))
    expect(screen.queryByText('¿Por qué es crítica?')).not.toBeInTheDocument()
    expect(valor().severidad).toBe('Crítica')
  })
})
