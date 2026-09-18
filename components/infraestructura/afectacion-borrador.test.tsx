// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { AfectacionBorradorCard, type AfectacionBorrador, type AfectacionBorradorCardProps } from './afectacion-borrador'
import type { MotivoRow } from '@/lib/infraestructura/motivos'

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

const motivos: MotivoRow[] = [
  { id: 'inundacion', nombre: 'Inundación', categoria: 'establecimiento', orden: 10 },
  { id: 'tormenta-severa', nombre: 'Tormenta severa', categoria: 'establecimiento', orden: 20 },
  { id: 'anegamiento', nombre: 'Anegamiento', categoria: 'alumnos', orden: 10 },
]

const borradorBase: AfectacionBorrador = {
  clientId: 'a1',
  categoria: '',
  motivo: '',
  severidad: '',
  secciones: [],
  alumnos: [],
  descripcion: '',
}

function renderCard(overrides: Partial<AfectacionBorradorCardProps> = {}) {
  const props: AfectacionBorradorCardProps = {
    borrador: borradorBase,
    index: 0,
    motivos,
    turnos,
    otrasAfectaciones: [],
    onChange: vi.fn(),
    onRemove: vi.fn(),
    ...overrides,
  }
  render(<AfectacionBorradorCard {...props} />)
  return props
}

describe('AfectacionBorradorCard', () => {
  it('renderiza los radios de categoría y seleccionar uno emite onChange con la categoría, motivo y alumnos limpios', () => {
    const onChange = vi.fn()
    renderCard({
      borrador: { ...borradorBase, motivo: 'Inundación', alumnos: [1, 2], secciones: [10] },
      onChange,
    })

    fireEvent.click(screen.getByRole('radio', { name: /afecta al establecimiento/i }))

    expect(onChange).toHaveBeenCalledWith({
      ...borradorBase,
      categoria: 'establecimiento',
      motivo: '',
      alumnos: [],
      secciones: [10],
    })
  })

  it('seleccionar un motivo del select filtrado emite onChange con ese motivo', () => {
    const onChange = vi.fn()
    renderCard({ borrador: { ...borradorBase, categoria: 'establecimiento' }, onChange })

    fireEvent.change(screen.getByLabelText(/^motivo/i), { target: { value: 'Inundación' } })

    expect(onChange).toHaveBeenCalledWith({
      ...borradorBase,
      categoria: 'establecimiento',
      motivo: 'Inundación',
    })
  })

  it('el select de motivo solo ofrece los motivos de la categoría elegida', () => {
    renderCard({ borrador: { ...borradorBase, categoria: 'alumnos' } })

    const opciones = screen
      .getByLabelText(/^motivo/i)
      .querySelectorAll('option')
    const valores = Array.from(opciones).map((opcion) => opcion.value)
    expect(valores).toContain('Anegamiento')
    expect(valores).not.toContain('Inundación')
  })

  it('clic en Quitar llama onRemove', () => {
    const onRemove = vi.fn()
    renderCard({ onRemove })

    fireEvent.click(screen.getByRole('button', { name: /quitar afectación 1/i }))

    expect(onRemove).toHaveBeenCalledTimes(1)
  })

  it('resumen suma la matrícula de las secciones elegidas', () => {
    renderCard({ borrador: { ...borradorBase, secciones: [10, 11] } })

    expect(screen.getByText('2 secciones · 53 alumnos')).toBeInTheDocument()
  })

  it('resumen usa la cantidad de alumnos explícitos cuando los hay', () => {
    renderCard({ borrador: { ...borradorBase, secciones: [10, 11], alumnos: [1, 2, 3] } })

    expect(screen.getByText('2 secciones · 3 alumnos')).toBeInTheDocument()
  })

  it('muestra la nota de duplicado cuando otra afectación tiene el mismo motivo', () => {
    renderCard({
      borrador: { ...borradorBase, categoria: 'establecimiento', motivo: 'Inundación' },
      otrasAfectaciones: [
        { ...borradorBase, clientId: 'a0', categoria: 'establecimiento', motivo: 'Inundación' },
      ],
    })

    expect(screen.getByText(/ya agregó una afectación/i)).toBeInTheDocument()
  })

  it('muestra la nota de duplicado cuando otra afectación comparte la categoría con distinto motivo', () => {
    renderCard({
      borrador: { ...borradorBase, categoria: 'establecimiento', motivo: 'Inundación' },
      otrasAfectaciones: [
        { ...borradorBase, clientId: 'a0', categoria: 'establecimiento', motivo: 'Tormenta severa' },
      ],
    })

    expect(screen.getByText(/ya agregó una afectación/i)).toBeInTheDocument()
  })

  it('no muestra la nota de duplicado cuando no hay coincidencia de motivo ni categoría', () => {
    renderCard({
      borrador: { ...borradorBase, categoria: 'establecimiento', motivo: 'Inundación' },
      otrasAfectaciones: [
        { ...borradorBase, clientId: 'a0', categoria: 'alumnos', motivo: 'Anegamiento' },
      ],
    })

    expect(screen.queryByText(/ya agregó una afectación/i)).not.toBeInTheDocument()
  })
})