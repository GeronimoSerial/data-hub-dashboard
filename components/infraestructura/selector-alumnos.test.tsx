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
    const totalTurno = TURNOS_FIXTURE[0].niveles.flatMap((nivel) => nivel.secciones).reduce((total, seccion) => total + seccion.alumnos.length, 0)
    expect(screen.getByRole('heading', { name: `Mañana · 0 de ${totalTurno} alumnos` })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: new RegExp(`${primera.curso}`) })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: new RegExp(`${primera.curso} "${primera.division}"`) })).toHaveAttribute('aria-expanded', 'false')
  })

  it('marcar un alumno actualiza el contador y emite alumnos explícitos', () => {
    render(<Controlado />)
    const seccion = TURNOS_FIXTURE[0].niveles[0].secciones[0]
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`${seccion.curso} "${seccion.division}"`) }))
    const alumno = seccion.alumnos[0]
    fireEvent.click(screen.getByRole('checkbox', { name: `${alumno.apellido}, ${alumno.nombre}` }))
    expect(screen.getByRole('button', { name: new RegExp(`Elegir alumnos \\(1 de ${seccion.alumnos.length}\\)`) })).toBeInTheDocument()
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

  it('permite buscar dentro de una sección con más de diez alumnos', () => {
    const base = TURNOS_FIXTURE[0]
    const seccion = base.niveles[0].secciones[0]
    const alumnos = Array.from({ length: 11 }, (_, indice) => ({
      gePersonId: 500 + indice,
      apellido: indice === 10 ? 'Zárate' : `Apellido${indice}`,
      nombre: `Nombre${indice}`,
    }))
    render(<SelectorAlumnos turnos={[{
      ...base,
      niveles: [{ ...base.niveles[0], secciones: [{ ...seccion, alumnos }] }],
    }]} alumnosSeleccionados={[]} onCambiar={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: /elegir alumnos/i }))
    fireEvent.change(screen.getByRole('searchbox', { name: /buscar alumnos/i }), { target: { value: 'Zárate' } })

    expect(screen.getByRole('checkbox', { name: 'Zárate, Nombre10' })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Apellido0, Nombre0' })).not.toBeInTheDocument()
  })
})
