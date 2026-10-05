// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { TURNOS_FIXTURE } from '@/components/test-utils/parte-formulario'
import { SelectorEstablecimiento, type ValorAlcanceEstablecimiento } from './selector-establecimiento'

const todas = TURNOS_FIXTURE.flatMap((t) => t.niveles.flatMap((n) => n.secciones))

function Controlado() {
  const [v, setV] = useState<ValorAlcanceEstablecimiento>({ alcance: '', secciones: [] })
  return (
    <>
      <SelectorEstablecimiento turnos={TURNOS_FIXTURE} valor={v} onCambiar={setV} />
      <output data-testid="v">{JSON.stringify(v)}</output>
    </>
  )
}
const v = () => JSON.parse(screen.getByTestId('v').textContent!)

afterEach(cleanup)

describe('SelectorEstablecimiento', () => {
  it('no tiene checkbox maestro de tres estados', () => {
    render(<Controlado />)
    expect(screen.queryByRole('checkbox', { name: /Todas las secciones/ })).not.toBeInTheDocument()
  })
  it('"Toda la escuela" selecciona todas las secciones', () => {
    render(<Controlado />)
    fireEvent.click(screen.getByRole('radio', { name: 'Toda la escuela' }))
    expect(v()).toEqual({ alcance: 'toda', secciones: todas.map((s) => s.geSectionId) })
  })
  it('"Algunas secciones" muestra checkboxes simples y marcar una no marca "Toda la escuela"', () => {
    render(<Controlado />)
    fireEvent.click(screen.getByRole('radio', { name: 'Algunas secciones' }))
    const s = todas[0]
    fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(`^${s.curso} "${s.division}"`) }))
    expect(v()).toEqual({ alcance: 'algunas', secciones: [s.geSectionId] })
    expect(screen.getByRole('radio', { name: 'Toda la escuela' })).not.toBeChecked()
  })
  it('marcar una sección despliega sus alumnos en sólo lectura', () => {
    render(<Controlado />)
    fireEvent.click(screen.getByRole('radio', { name: 'Algunas secciones' }))
    const s = todas.find((x) => x.alumnos.length > 0)!
    fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(`^${s.curso} "${s.division}"`) }))
    expect(screen.getByText(`${s.alumnos[0].apellido}, ${s.alumnos[0].nombre}`)).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: `${s.alumnos[0].apellido}, ${s.alumnos[0].nombre}` })).not.toBeInTheDocument()
  })
  it('"Todo el turno" marca las secciones del turno', () => {
    render(<Controlado />)
    fireEvent.click(screen.getByRole('radio', { name: 'Algunas secciones' }))
    const turno = TURNOS_FIXTURE[0]
    fireEvent.click(screen.getByRole('checkbox', { name: `Todo el turno ${turno.turno}` }))
    const ids = turno.niveles.flatMap((n) => n.secciones.map((s) => s.geSectionId))
    expect(v().secciones).toEqual(ids)
  })
})
