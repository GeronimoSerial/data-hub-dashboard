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
    expect(screen.getByRole('heading', { name: TURNOS_FIXTURE[0].niveles[0].nivel })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: new RegExp(`${primera.curso}`) })).not.toBeInTheDocument()
    const encabezado = screen.getByRole('button', { name: new RegExp(`${primera.curso} "${primera.division}" · 0 de ${primera.alumnos.length}.*Elegir alumnos`) })
    expect(encabezado).toHaveAttribute('aria-expanded', 'false')
  })

  it('marcar un alumno actualiza el contador y emite alumnos explícitos', () => {
    render(<Controlado />)
    const seccion = TURNOS_FIXTURE[0].niveles[0].secciones[0]
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`${seccion.curso} "${seccion.division}"`) }))
    const alumno = seccion.alumnos[0]
    fireEvent.click(screen.getByRole('checkbox', { name: `${alumno.apellido}, ${alumno.nombre}` }))
    expect(screen.getByRole('button', { name: new RegExp(`${seccion.curso} "${seccion.division}" · 1 de ${seccion.alumnos.length}.*Elegir alumnos`) })).toBeInTheDocument()
    expect(JSON.parse(screen.getByTestId('estado').textContent!)).toEqual({ secciones: [seccion.geSectionId], alumnos: [alumno.gePersonId] })
  })

  it('marcar a todos los alumnos de una sección sigue emitiendo la lista explícita', () => {
    render(<Controlado />)
    const seccion = TURNOS_FIXTURE[0].niveles[0].secciones[0]
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`${seccion.curso} "${seccion.division}"`) }))
    for (const a of seccion.alumnos) fireEvent.click(screen.getByRole('checkbox', { name: `${a.apellido}, ${a.nombre}` }))
    expect(JSON.parse(screen.getByTestId('estado').textContent!).alumnos).toHaveLength(seccion.alumnos.length)
  })

  it('ordena alumnos por apellido y luego nombre con colación es-AR', () => {
    const base = TURNOS_FIXTURE[0]
    const seccion = base.niveles[0].secciones[0]
    const alumnos = [
      { gePersonId: 1, apellido: 'Pérez', nombre: 'Zoe' },
      { gePersonId: 2, apellido: 'Álvarez', nombre: 'Luis' },
      { gePersonId: 3, apellido: 'Pérez', nombre: 'Ana' },
    ]
    render(<SelectorAlumnos turnos={[{
      ...base,
      niveles: [{ ...base.niveles[0], secciones: [{ ...seccion, alumnos }] }],
    }]} alumnosSeleccionados={[]} onCambiar={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /Sala|Elegir alumnos/i }))

    const labels = [...document.querySelectorAll('.selector-alumnos__lista .opcion__label')].slice(1).map((label) => label.textContent)
    expect(labels).toEqual(['Álvarez, Luis', 'Pérez, Ana', 'Pérez, Zoe'])
  })

  it('muestra la sección primero y permite marcar y quitar toda la sección', () => {
    const base = TURNOS_FIXTURE[0]
    const seccion = base.niveles[0].secciones[0]
    const alumnos = [
      { gePersonId: 701, apellido: 'Gómez', nombre: 'Ana' },
      { gePersonId: 702, apellido: 'López', nombre: 'Luis' },
    ]
    const turnos = [{ ...base, niveles: [{ ...base.niveles[0], secciones: [{ ...seccion, curso: 'Sala 3', division: 'B', alumnos }] }] }]
    function ControladoSeccion() {
      const [alumnos, setAlumnos] = useState<number[]>([])
      return <>
        <SelectorAlumnos turnos={turnos} alumnosSeleccionados={alumnos} onCambiar={(_, siguiente) => setAlumnos(siguiente)} />
        <output data-testid="alumnos">{JSON.stringify(alumnos)}</output>
      </>
    }
    render(<ControladoSeccion />)

    const encabezado = screen.getByRole('button', { name: /Sala 3 "B" · 0 de/ })
    expect(encabezado).toBeInTheDocument()
    fireEvent.click(encabezado)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Marcar toda la sección' }))
    expect(screen.getByRole('checkbox', { name: 'Quitar toda la sección' })).toBeChecked()
    expect(JSON.parse(screen.getByTestId('alumnos').textContent!)).toHaveLength(alumnos.length)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Quitar toda la sección' }))
    expect(JSON.parse(screen.getByTestId('alumnos').textContent!)).toEqual([])
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
