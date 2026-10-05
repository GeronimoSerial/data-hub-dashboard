// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { SeccionesSelector, type SeccionesSelectorProps } from './secciones-selector'
import { turnos } from '@/components/test-utils/parte-formulario'

afterEach(() => {
  document.body.innerHTML = ''
})

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

const turnosSinIdentidades = turnos.map((turno) => ({
  ...turno,
  niveles: turno.niveles.map((nivel) => ({
    ...nivel,
    secciones: nivel.secciones.map((seccion) => ({ ...seccion, alumnos: [] })),
  })),
}))

const textoConComillasNormalizadas = (esperado: string) => (contenido: string) =>
  contenido.replace(/[“”]/g, '"') === esperado

type OnCambiarMock = ReturnType<
  typeof vi.fn<(geSectionIds: number[], alumnosSeleccionados: number[]) => void>
>

type SelectorOverrides = Omit<Partial<SeccionesSelectorProps>, 'onCambiar'> & {
  onCambiar?: OnCambiarMock
}

function renderSelector(overrides: SelectorOverrides = {}) {
  const onCambiar = overrides.onCambiar ?? vi.fn()
  const props: SeccionesSelectorProps = {
    turnos,
    seleccionadas: [],
    alumnosSeleccionados: [],
    onCambiar,
    ...overrides,
  }
  return { ...render(<SeccionesSelector {...props} />), user: userEvent.setup(), onCambiar }
}

describe('SeccionesSelector', () => {
  it('renderiza cada sección con su curso, división y matrícula', () => {
    renderSelector()

    expect(screen.getByText(textoConComillasNormalizadas('1° "A" · 28 alumnos'))).toBeInTheDocument()
    expect(screen.getByText(textoConComillasNormalizadas('4° "A" · 30 alumnos'))).toBeInTheDocument()
  })

  it('agrega una sección a la selección al tildarla', async () => {
    const { onCambiar, user } = renderSelector({ seleccionadas: [10] })

    await user.click(screen.getByRole('checkbox', { name: /1°\s*["“”]B["“”]/ }))

    expect(onCambiar.mock.calls[0][0].sort()).toEqual([10, 11])
    expect(onCambiar.mock.calls[0][1]).toEqual([])
  })

  it('quita una sección de la selección al destildarla', async () => {
    const { onCambiar, user } = renderSelector({ seleccionadas: [10, 11] })

    await user.click(screen.getByRole('checkbox', { name: /1°\s*["“”]A["“”]/ }))

    expect(onCambiar).toHaveBeenCalledWith([11], [])
  })

  it('permite seleccionar una sección por teclado', async () => {
    const { onCambiar, user } = renderSelector()

    screen.getByRole('checkbox', { name: /4°\s*["“”]A["“”]/ }).focus()
    await user.keyboard(' ')

    expect(onCambiar).toHaveBeenCalled()
    expect(onCambiar.mock.calls[0][0]).toContain(20)
  })

  it('no llama onCambiar cuando está deshabilitado', async () => {
    const { onCambiar, user } = renderSelector({ disabled: true })

    await user.click(screen.getByRole('checkbox', { name: /1°\s*["“”]A["“”]/ }))

    expect(onCambiar).not.toHaveBeenCalled()
  })

  it('selecciona todas las secciones con el checkbox general', async () => {
    const { onCambiar, user } = renderSelector()

    await user.click(screen.getByRole('checkbox', { name: /todas las secciones/i }))

    expect(onCambiar.mock.calls[0][0].sort((a: number, b: number) => a - b)).toEqual([10, 11, 20])
    expect(onCambiar.mock.calls[0][1]).toEqual([])
  })

  it('permite seleccionar y quitar todas las secciones de un turno', async () => {
    const { onCambiar, user, unmount } = renderSelector({ turnos: turnosConAlumnos })
    const turno = screen.getByRole('checkbox', { name: 'Todo el turno Mañana' })

    await user.click(turno)
    expect(onCambiar).toHaveBeenLastCalledWith([10], [])
    unmount()

    const { onCambiar: onQuitar, user: userQuitar } = renderSelector({ turnos: turnosConAlumnos, seleccionadas: [10] })
    await userQuitar.click(screen.getByRole('checkbox', { name: 'Todo el turno Mañana' }))
    expect(onQuitar).toHaveBeenCalledWith([], [])
  })

  it('muestra indeterminado el turno con selección parcial y marcado cuando están todas', () => {
    const turno = turnosConAlumnos[0]
    const segunda = { ...turno.niveles[0].secciones[0], geSectionId: 11, curso: '2°' }
    const turnosDosSecciones = [{ ...turno, niveles: [{ ...turno.niveles[0], secciones: [turno.niveles[0].secciones[0], segunda] }] }]
    const { rerender } = renderSelector({ turnos: turnosDosSecciones, seleccionadas: [10] })
    const todoTurno = screen.getByRole('checkbox', { name: 'Todo el turno Mañana' })
    expect(todoTurno).toBePartiallyChecked()

    rerender(<SeccionesSelector turnos={turnosDosSecciones} seleccionadas={[10, 11]} alumnosSeleccionados={[]} onCambiar={vi.fn()} />)
    expect(screen.getByRole('checkbox', { name: 'Todo el turno Mañana' })).toBeChecked()
  })

  describe('con alumnos por sección', () => {
    it('muestra un checkbox por alumno al desplegar la sección', async () => {
      const { user } = renderSelector({ turnos: turnosConAlumnos })

      await user.click(screen.getByRole('button', { name: /elegir alumnos/i }))

      expect(screen.getByRole('checkbox', { name: /Gómez, Ana/ })).toBeInTheDocument()
      expect(screen.getByRole('checkbox', { name: /Pérez, Luis/ })).toBeInTheDocument()
    })

    it('arranca con la lista nominal plegada', () => {
      renderSelector({ turnos: turnosConAlumnos })

      expect(screen.queryByRole('checkbox', { name: /Gómez, Ana/ })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /elegir alumnos/i })).toHaveAttribute(
        'aria-expanded',
        'false',
      )
    })

    it('muestra contadores por turno y sección', async () => {
      const { user } = renderSelector({ turnos: turnosConAlumnos, seleccionadas: [10] })
      expect(screen.getByRole('heading', { name: 'Mañana · 1 de 1 secciones' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Primario · 1 de 1' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Elegir alumnos (2 de 2)' })).toBeInTheDocument()
    })

    it('busca alumnos cuando una sección tiene más de diez', async () => {
      const alumnos = Array.from({ length: 11 }, (_, indice) => ({
        gePersonId: 100 + indice,
        apellido: indice === 10 ? 'Zárate' : `Apellido${indice}`,
        nombre: `Nombre${indice}`,
      }))
      const { user } = renderSelector({
        turnos: [{ ...turnosConAlumnos[0], niveles: [{ ...turnosConAlumnos[0].niveles[0], secciones: [{ ...turnosConAlumnos[0].niveles[0].secciones[0], alumnos }] }] }],
      })
      await user.click(screen.getByRole('button', { name: /elegir alumnos/i }))
      await user.type(screen.getByRole('searchbox', { name: /buscar alumnos/i }), 'Zárate')
      expect(screen.getByRole('checkbox', { name: 'Zárate, Nombre10' })).toBeInTheDocument()
      expect(screen.queryByRole('checkbox', { name: 'Apellido0, Nombre0' })).not.toBeInTheDocument()
    })

    it('arranca desplegada si la sección ya trae alumnos elegidos explícitamente', () => {
      renderSelector({ turnos: turnosConAlumnos, seleccionadas: [10], alumnosSeleccionados: [2] })

      expect(screen.getByRole('checkbox', { name: /Pérez, Luis/ })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /elegir alumnos/i })).toHaveAttribute(
        'aria-expanded',
        'true',
      )
    })

    it('vuelve a plegar la lista nominal sin tocar la selección', async () => {
      const { onCambiar, user } = renderSelector({
        turnos: turnosConAlumnos,
        seleccionadas: [10],
        alumnosSeleccionados: [2],
      })

      await user.click(screen.getByRole('button', { name: /elegir alumnos/i }))

      expect(screen.queryByRole('checkbox', { name: /Pérez, Luis/ })).not.toBeInTheDocument()
      expect(onCambiar).not.toHaveBeenCalled()
      // Plegar no puede esconder que la sección quedó parcial.
      expect(screen.getByRole('checkbox', { name: /1°/ })).toBePartiallyChecked()
    })

    it('no ofrece desplegar cuando la sección no tiene identidades cargadas', () => {
      renderSelector({ turnos: turnosSinIdentidades })

      expect(screen.queryByRole('button', { name: /alumnos/i })).not.toBeInTheDocument()
    })

    it('tildar la sección marca a todos sus alumnos y no deja lista explícita', async () => {
      const { onCambiar, user } = renderSelector({ turnos: turnosConAlumnos })

      await user.click(screen.getByRole('checkbox', { name: /1°/ }))

      expect(onCambiar).toHaveBeenCalledWith([10], [])
    })

    it('destildar un alumno dentro de una sección completa la deja parcial', async () => {
      const { onCambiar, user } = renderSelector({ turnos: turnosConAlumnos, seleccionadas: [10] })

      await user.click(screen.getByRole('button', { name: /elegir alumnos/i }))
      await user.click(screen.getByRole('checkbox', { name: /Gómez, Ana/ }))

      expect(onCambiar).toHaveBeenCalledWith([10], [2])
    })

    it('la sección se muestra indeterminada cuando la selección de alumnos es parcial', () => {
      renderSelector({ turnos: turnosConAlumnos, seleccionadas: [10], alumnosSeleccionados: [2] })

      const checkboxSeccion = screen.getByRole('checkbox', { name: /1°/ })
      expect(checkboxSeccion).toBePartiallyChecked()
      expect(checkboxSeccion).not.toBeChecked()
    })

    it('destildar el único alumno restante de una selección parcial saca la sección entera', async () => {
      const { onCambiar, user } = renderSelector({
        turnos: turnosConAlumnos,
        seleccionadas: [10],
        alumnosSeleccionados: [2],
      })

      await user.click(screen.getByRole('checkbox', { name: /Pérez, Luis/ }))

      expect(onCambiar).toHaveBeenCalledWith([], [])
    })

    it('tildar de nuevo al único alumno que faltaba vuelve la sección a completa', async () => {
      const { onCambiar, user } = renderSelector({
        turnos: turnosConAlumnos,
        seleccionadas: [10],
        alumnosSeleccionados: [2],
      })

      await user.click(screen.getByRole('checkbox', { name: /Gómez, Ana/ }))

      expect(onCambiar).toHaveBeenCalledWith([10], [])
    })

    it('tildar un alumno de una sección no seleccionada la agrega parcial', async () => {
      const { onCambiar, user } = renderSelector({ turnos: turnosConAlumnos })

      await user.click(screen.getByRole('button', { name: /elegir alumnos/i }))
      await user.click(screen.getByRole('checkbox', { name: /Gómez, Ana/ }))

      expect(onCambiar).toHaveBeenCalledWith([10], [1])
    })
  })

  describe('con permiteAlumnos en false (categoría establecimiento)', () => {
    it('no ofrece "Elegir alumnos" aunque la sección tenga identidades cargadas', () => {
      renderSelector({ turnos: turnosConAlumnos, permiteAlumnos: false })

      expect(screen.queryByRole('button', { name: /elegir alumnos/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('checkbox', { name: /Gómez, Ana/ })).not.toBeInTheDocument()
    })

    it('tildar la sección nunca emite alumnos, incluso con identidades cargadas', async () => {
      const { onCambiar, user } = renderSelector({
        turnos: turnosConAlumnos,
        permiteAlumnos: false,
      })

      await user.click(screen.getByRole('checkbox', { name: /1°/ }))

      expect(onCambiar).toHaveBeenCalledWith([10], [])
    })

    it('destildar la sección la saca de la selección sin tocar alumnos', async () => {
      const { onCambiar, user } = renderSelector({
        turnos: turnosConAlumnos,
        seleccionadas: [10],
        permiteAlumnos: false,
      })

      await user.click(screen.getByRole('checkbox', { name: /1°/ }))

      expect(onCambiar).toHaveBeenCalledWith([], [])
    })

    it('el checkbox de sección nunca queda indeterminado', () => {
      renderSelector({ turnos: turnosConAlumnos, seleccionadas: [10], permiteAlumnos: false })

      const checkboxSeccion = screen.getByRole('checkbox', { name: /1°/ })
      expect(checkboxSeccion).not.toBePartiallyChecked()
      expect(checkboxSeccion).toBeChecked()
    })
  })
})
