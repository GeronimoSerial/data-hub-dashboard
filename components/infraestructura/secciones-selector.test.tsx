// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { SeccionesSelector } from './secciones-selector'

afterEach(() => {
  document.body.innerHTML = ''
})

const turnos = [
  {
    turno: 'Mañana',
    niveles: [
      {
        nivel: 'Primario',
        secciones: [
          { geSectionId: 10, curso: '1°', division: 'A', nivel: 'Primario', turno: 'Mañana', matricula: 28, alumnos: [] },
          { geSectionId: 11, curso: '1°', division: 'B', nivel: 'Primario', turno: 'Mañana', matricula: 25, alumnos: [] },
        ],
      },
    ],
  },
  {
    turno: 'Tarde',
    niveles: [
      {
        nivel: 'Secundario',
        secciones: [
          { geSectionId: 20, curso: '4°', division: 'A', nivel: 'Secundario', turno: 'Tarde', matricula: 30, alumnos: [] },
        ],
      },
    ],
  },
]

const turnosConAlumnos = [
  {
    turno: 'Mañana',
    niveles: [
      {
        nivel: 'Primario',
        secciones: [
          {
            geSectionId: 10,
            curso: '1°',
            division: 'A',
            nivel: 'Primario',
            turno: 'Mañana',
            matricula: 2,
            alumnos: [
              { gePersonId: 1, nombre: 'Ana', apellido: 'Gómez' },
              { gePersonId: 2, nombre: 'Luis', apellido: 'Pérez' },
            ],
          },
        ],
      },
    ],
  },
]

const textoConComillasNormalizadas = (esperado: string) => (contenido: string) =>
  contenido.replace(/[“”]/g, '"') === esperado

describe('SeccionesSelector', () => {
  it('renderiza cada sección con su curso, división y matrícula', () => {
    render(
      <SeccionesSelector turnos={turnos} seleccionadas={[]} alumnosSeleccionados={[]} onCambiar={vi.fn()} />,
    )

    expect(screen.getByText(textoConComillasNormalizadas('1° "A" — 28 alumnos'))).toBeInTheDocument()
    expect(screen.getByText(textoConComillasNormalizadas('4° "A" — 30 alumnos'))).toBeInTheDocument()
  })

  it('agrega una sección a la selección al tildarla', async () => {
    const onCambiar = vi.fn()
    const user = userEvent.setup()
    render(
      <SeccionesSelector turnos={turnos} seleccionadas={[10]} alumnosSeleccionados={[]} onCambiar={onCambiar} />,
    )

    await user.click(screen.getByRole('checkbox', { name: /1°\s*["“”]B["“”]/ }))

    expect(onCambiar.mock.calls[0][0].sort()).toEqual([10, 11])
    expect(onCambiar.mock.calls[0][1]).toEqual([])
  })

  it('quita una sección de la selección al destildarla', async () => {
    const onCambiar = vi.fn()
    const user = userEvent.setup()
    render(
      <SeccionesSelector turnos={turnos} seleccionadas={[10, 11]} alumnosSeleccionados={[]} onCambiar={onCambiar} />,
    )

    await user.click(screen.getByRole('checkbox', { name: /1°\s*["“”]A["“”]/ }))

    expect(onCambiar).toHaveBeenCalledWith([11], [])
  })

  it('permite seleccionar una sección por teclado', async () => {
    const onCambiar = vi.fn()
    const user = userEvent.setup()
    render(<SeccionesSelector turnos={turnos} seleccionadas={[]} alumnosSeleccionados={[]} onCambiar={onCambiar} />)

    screen.getByRole('checkbox', { name: /4°\s*["“”]A["“”]/ }).focus()
    await user.keyboard(' ')

    expect(onCambiar).toHaveBeenCalled()
    expect(onCambiar.mock.calls[0][0]).toContain(20)
  })

  it('no llama onCambiar cuando está deshabilitado', async () => {
    const onCambiar = vi.fn()
    const user = userEvent.setup()
    render(
      <SeccionesSelector
        turnos={turnos}
        seleccionadas={[]}
        alumnosSeleccionados={[]}
        onCambiar={onCambiar}
        disabled
      />,
    )

    await user.click(screen.getByRole('checkbox', { name: /1°\s*["“”]A["“”]/ }))

    expect(onCambiar).not.toHaveBeenCalled()
  })

  it('selecciona todas las secciones con el checkbox general', async () => {
    const onCambiar = vi.fn()
    const user = userEvent.setup()
    render(<SeccionesSelector turnos={turnos} seleccionadas={[]} alumnosSeleccionados={[]} onCambiar={onCambiar} />)

    await user.click(screen.getByRole('checkbox', { name: /todas las secciones/i }))

    expect(onCambiar.mock.calls[0][0].sort((a: number, b: number) => a - b)).toEqual([10, 11, 20])
    expect(onCambiar.mock.calls[0][1]).toEqual([])
  })

  describe('con alumnos por sección', () => {
    it('muestra un checkbox por alumno debajo de la sección', () => {
      render(
        <SeccionesSelector
          turnos={turnosConAlumnos}
          seleccionadas={[]}
          alumnosSeleccionados={[]}
          onCambiar={vi.fn()}
        />,
      )

      expect(screen.getByRole('checkbox', { name: /Gómez, Ana/ })).toBeInTheDocument()
      expect(screen.getByRole('checkbox', { name: /Pérez, Luis/ })).toBeInTheDocument()
    })

    it('tildar la sección marca a todos sus alumnos y no deja lista explícita', async () => {
      const onCambiar = vi.fn()
      const user = userEvent.setup()
      render(
        <SeccionesSelector
          turnos={turnosConAlumnos}
          seleccionadas={[]}
          alumnosSeleccionados={[]}
          onCambiar={onCambiar}
        />,
      )

      await user.click(screen.getByRole('checkbox', { name: /1°/ }))

      expect(onCambiar).toHaveBeenCalledWith([10], [])
    })

    it('destildar un alumno dentro de una sección completa la deja parcial', async () => {
      const onCambiar = vi.fn()
      const user = userEvent.setup()
      render(
        <SeccionesSelector
          turnos={turnosConAlumnos}
          seleccionadas={[10]}
          alumnosSeleccionados={[]}
          onCambiar={onCambiar}
        />,
      )

      await user.click(screen.getByRole('checkbox', { name: /Gómez, Ana/ }))

      expect(onCambiar).toHaveBeenCalledWith([10], [2])
    })

    it('la sección se muestra indeterminada cuando la selección de alumnos es parcial', () => {
      render(
        <SeccionesSelector
          turnos={turnosConAlumnos}
          seleccionadas={[10]}
          alumnosSeleccionados={[2]}
          onCambiar={vi.fn()}
        />,
      )

      const checkboxSeccion = screen.getByRole('checkbox', { name: /1°/ })
      expect(checkboxSeccion).toHaveAttribute('data-indeterminate')
      expect(checkboxSeccion).not.toHaveAttribute('data-checked')
    })

    it('destildar el único alumno restante de una selección parcial saca la sección entera', async () => {
      const onCambiar = vi.fn()
      const user = userEvent.setup()
      render(
        <SeccionesSelector
          turnos={turnosConAlumnos}
          seleccionadas={[10]}
          alumnosSeleccionados={[2]}
          onCambiar={onCambiar}
        />,
      )

      await user.click(screen.getByRole('checkbox', { name: /Pérez, Luis/ }))

      expect(onCambiar).toHaveBeenCalledWith([], [])
    })

    it('tildar de nuevo al único alumno que faltaba vuelve la sección a completa', async () => {
      const onCambiar = vi.fn()
      const user = userEvent.setup()
      render(
        <SeccionesSelector
          turnos={turnosConAlumnos}
          seleccionadas={[10]}
          alumnosSeleccionados={[2]}
          onCambiar={onCambiar}
        />,
      )

      await user.click(screen.getByRole('checkbox', { name: /Gómez, Ana/ }))

      expect(onCambiar).toHaveBeenCalledWith([10], [])
    })

    it('tildar un alumno de una sección no seleccionada la agrega parcial', async () => {
      const onCambiar = vi.fn()
      const user = userEvent.setup()
      render(
        <SeccionesSelector
          turnos={turnosConAlumnos}
          seleccionadas={[]}
          alumnosSeleccionados={[]}
          onCambiar={onCambiar}
        />,
      )

      await user.click(screen.getByRole('checkbox', { name: /Gómez, Ana/ }))

      expect(onCambiar).toHaveBeenCalledWith([10], [1])
    })
  })
})
