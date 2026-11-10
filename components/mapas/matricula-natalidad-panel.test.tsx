// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { construirMatriculaNatalidad } from '@/lib/mapas/matricula-natalidad'
import { MatriculaNatalidadPanel } from './matricula-natalidad-panel'

const datos = construirMatriculaNatalidad([
  { cueAnexo: '1800746-00', departamento: 'Concepción', nivel: 'Inicial', curso: 'Sala de 4', anio: 2025, matricula: 89, secciones: 4 },
  { cueAnexo: '1800746-00', departamento: 'Concepción', nivel: 'Inicial', curso: 'Sala de 5', anio: 2026, matricula: 0, secciones: 1 },
])

afterEach(cleanup)

describe('MatriculaNatalidadPanel', () => {
  it('muestra la cobertura y serie departamental sin convertir niveles ausentes en cero', () => {
    render(<MatriculaNatalidadPanel datos={datos} departamento="CONCEPCIÓN" />)
    fireEvent.click(screen.getByText('Ver evolución y cobertura'))
    expect(screen.getByText(/No representa todo el sistema/)).toBeTruthy()
    const row = screen.getByRole('row', { name: '2025 89 — 89' })
    expect(within(row).getAllByText('89')).toHaveLength(2)
  })

  it('permite cambiar el ciclo de la escuela, conserva cero y desglosa por curso', () => {
    render(<MatriculaNatalidadPanel datos={datos} cueAnexo="1800746-00" />)
    fireEvent.click(screen.getByText('Ver evolución y cobertura'))
    expect(screen.getByRole('cell', { name: 'Sala de 5' })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Ciclo lectivo de matrícula'), { target: { value: '2025' } })
    expect(screen.getByRole('cell', { name: 'Sala de 4' })).toBeTruthy()
    expect(screen.queryByRole('cell', { name: 'Sala de 5' })).toBeNull()
  })

  it('explica ausencia de cobertura sin atribuir matrícula cero', () => {
    render(<MatriculaNatalidadPanel datos={datos} cueAnexo="1800000-00" />)
    fireEvent.click(screen.getByText('Ver evolución y cobertura'))
    expect(screen.getByText(/Sin registros para esta escuela/)).toBeTruthy()
  })

  it('mantiene visible un error de carga sin sustituir datos por ceros', () => {
    render(<MatriculaNatalidadPanel datos={null} error />)
    expect(screen.getByText(/No se pudo cargar la matrícula/)).toBeTruthy()
  })
})

it('destaca matrícula y alumnos por sección activa para el ciclo seleccionado', () => {
  render(<MatriculaNatalidadPanel datos={datos} departamento="Concepción" />)
  expect(screen.getByText(/Alumnos por sección activa/)).toBeTruthy()
  expect(screen.getByLabelText('Ciclo lectivo de matrícula')).toBeTruthy()
})
