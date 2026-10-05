// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { TURNOS_FIXTURE } from '@/components/test-utils/parte-formulario'
import { SelectorAlumnos } from './selector-alumnos'

afterEach(cleanup)

function Controlado() {
  const [estado, setEstado] = useState<{ secciones: number[]; alumnos: number[] }>({ secciones: [], alumnos: [] })
  return (
    <>
      <SelectorAlumnos
        turnos={TURNOS_FIXTURE}
        alumnosSeleccionados={estado.alumnos}
        onCambiar={(secciones, alumnos) => setEstado({ secciones, alumnos })}
      />
      <output data-testid="estado">{JSON.stringify(estado)}</output>
    </>
  )
}

describe('SelectorAlumnos', () => {
  it('las secciones son agrupadores sin checkbox', () => {
    render(<Controlado />)
    const primera = TURNOS_FIXTURE[0].niveles[0].secciones[0]
    expect(screen.queryByRole('checkbox', { name: new RegExp(`${primera.curso}`) })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: new RegExp(`${primera.curso} "${primera.division}"`) })).toHaveAttribute('aria-expanded', 'false')
  })

  it('marcar un alumno muestra el badge "1 de N seleccionados" y emite alumnos explícitos', () => {
    render(<Controlado />)
    const seccion = TURNOS_FIXTURE[0].niveles[0].secciones[0]
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`${seccion.curso} "${seccion.division}"`) }))
    const alumno = seccion.alumnos[0]
    fireEvent.click(screen.getByRole('checkbox', { name: `${alumno.apellido}, ${alumno.nombre}` }))
    expect(screen.getByText(`1 de ${seccion.alumnos.length} seleccionados`)).toBeInTheDocument()
    expect(JSON.parse(screen.getByTestId('estado').textContent!)).toEqual({ secciones: [seccion.geSectionId], alumnos: [alumno.gePersonId] })
  })

  it('marcar a todos los alumnos de una sección sigue emitiendo la lista explícita', () => {
    render(<Controlado />)
    const seccion = TURNOS_FIXTURE[0].niveles[0].secciones[0]
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`${seccion.curso} "${seccion.division}"`) }))
    for (const a of seccion.alumnos) fireEvent.click(screen.getByRole('checkbox', { name: `${a.apellido}, ${a.nombre}` }))
    expect(JSON.parse(screen.getByTestId('estado').textContent!).alumnos).toHaveLength(seccion.alumnos.length)
  })

  it('resume alumnos y secciones', () => {
    render(<Controlado />)
    const seccion = TURNOS_FIXTURE[0].niveles[0].secciones[0]
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`${seccion.curso} "${seccion.division}"`) }))
    fireEvent.click(screen.getByRole('checkbox', { name: `${seccion.alumnos[0].apellido}, ${seccion.alumnos[0].nombre}` }))
    expect(screen.getByText('1 alumno afectado en 1 sección')).toBeInTheDocument()
  })
})
