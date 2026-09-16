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
          { geSectionId: 10, curso: '1°', division: 'A', nivel: 'Primario', turno: 'Mañana', matricula: 28 },
          { geSectionId: 11, curso: '1°', division: 'B', nivel: 'Primario', turno: 'Mañana', matricula: 25 },
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
          { geSectionId: 20, curso: '4°', division: 'A', nivel: 'Secundario', turno: 'Tarde', matricula: 30 },
        ],
      },
    ],
  },
]

const textoConComillasNormalizadas = (esperado: string) => (contenido: string) =>
  contenido.replace(/[“”]/g, '"') === esperado

describe('SeccionesSelector', () => {
  it('renderiza cada sección con su curso, división y matrícula', () => {
    render(<SeccionesSelector turnos={turnos} seleccionadas={[]} onCambiar={vi.fn()} />)

    expect(screen.getByText(textoConComillasNormalizadas('1° "A" — 28 alumnos'))).toBeInTheDocument()
    expect(screen.getByText(textoConComillasNormalizadas('4° "A" — 30 alumnos'))).toBeInTheDocument()
  })

  it('agrega una sección a la selección al tildarla', async () => {
    const onCambiar = vi.fn()
    const user = userEvent.setup()
    render(<SeccionesSelector turnos={turnos} seleccionadas={[10]} onCambiar={onCambiar} />)

    await user.click(screen.getByRole('checkbox', { name: /1°\s*["“”]B["“”]/ }))

    expect(onCambiar.mock.calls[0][0].sort()).toEqual([10, 11])
  })

  it('quita una sección de la selección al destildarla', async () => {
    const onCambiar = vi.fn()
    const user = userEvent.setup()
    render(<SeccionesSelector turnos={turnos} seleccionadas={[10, 11]} onCambiar={onCambiar} />)

    await user.click(screen.getByRole('checkbox', { name: /1°\s*["“”]A["“”]/ }))

    expect(onCambiar).toHaveBeenCalledWith([11])
  })

  it('permite seleccionar una sección por teclado', async () => {
    const onCambiar = vi.fn()
    const user = userEvent.setup()
    render(<SeccionesSelector turnos={turnos} seleccionadas={[]} onCambiar={onCambiar} />)

    screen.getByRole('checkbox', { name: /4°\s*["“”]A["“”]/ }).focus()
    await user.keyboard(' ')

    expect(onCambiar).toHaveBeenCalled()
    expect(onCambiar.mock.calls[0][0]).toContain(20)
  })

  it('no llama onCambiar cuando está deshabilitado', async () => {
    const onCambiar = vi.fn()
    const user = userEvent.setup()
    render(<SeccionesSelector turnos={turnos} seleccionadas={[]} onCambiar={onCambiar} disabled />)

    await user.click(screen.getByRole('checkbox', { name: /1°\s*["“”]A["“”]/ }))

    expect(onCambiar).not.toHaveBeenCalled()
  })

  it('selecciona todas las secciones con el checkbox general', async () => {
    const onCambiar = vi.fn()
    const user = userEvent.setup()
    render(<SeccionesSelector turnos={turnos} seleccionadas={[]} onCambiar={onCambiar} />)

    await user.click(screen.getByRole('checkbox', { name: /todas las secciones/i }))

    expect(onCambiar.mock.calls[0][0].sort((a: number, b: number) => a - b)).toEqual([10, 11, 20])
  })
})
