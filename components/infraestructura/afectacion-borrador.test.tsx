// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { AfectacionBorradorCard, type AfectacionBorrador, type AfectacionBorradorCardProps } from './afectacion-borrador'
import { motivos, turnos } from '@/components/test-utils/parte-formulario'

afterEach(() => {
  document.body.innerHTML = ''
})

const borradorBase: AfectacionBorrador = {
  clientId: 'a1',
  categoria: '',
  motivo: '',
  severidad: '',
  justificacionCritica: '',
  justificacionCriticaDetalle: '',
  alcanceEstablecimiento: '',
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
    onResolver: vi.fn(),
    onDeshacer: vi.fn(),
    ...overrides,
  }
  render(<AfectacionBorradorCard {...props} />)
  return props
}

describe('AfectacionBorradorCard', () => {
  it('confirmar una categoría emite onChange con los campos dependientes limpios', () => {
    const onChange = vi.fn()
    renderCard({
      borrador: { ...borradorBase, motivo: 'Inundación', alumnos: [1, 2], secciones: [10] },
      onChange,
    })

    fireEvent.click(screen.getByRole('radio', { name: /afecta al establecimiento/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))

    expect(onChange).toHaveBeenCalledWith({
      ...borradorBase,
      categoria: 'establecimiento',
    })
  })

  it('elegir un motivo de la lista emite onChange con ese motivo', () => {
    const onChange = vi.fn()
    renderCard({ borrador: { ...borradorBase, categoria: 'establecimiento' }, onChange })

    fireEvent.click(screen.getByRole('radio', { name: 'Inundación' }))

    expect(onChange).toHaveBeenCalledWith({
      ...borradorBase,
      categoria: 'establecimiento',
      motivo: 'Inundación',
    })
  })

  // Motivo y severidad dejaron de ser <select>: con 3 a 5 opciones el
  // desplegable cuesta tres gestos y tapa la pantalla con un modal del
  // sistema, así que van a la vista como radios.
  it('los motivos se ofrecen a la vista y sólo los de la categoría elegida', () => {
    renderCard({ borrador: { ...borradorBase, categoria: 'alumnos' } })

    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.getByRole('radio', { name: 'Anegamiento' })).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'Inundación' })).toBeNull()
  })

  /*
    La tarjeta dejó de ser un disclosure con chevron. "Abierto" y "cerrado"
    son estados de software: el director no tenía cómo saber que la fila
    escondía campos ni qué pasaba al tocarla. Ahora afirma lo que ocurre y
    ofrece las dos cosas que pueden haber pasado en la escuela.
  */
  it('una situación ya informada se lee como afirmación, sin campos a la vista', () => {
    renderCard({
      borrador: { ...borradorBase, categoria: 'establecimiento', motivo: 'Inundación', severidad: 'Alta', secciones: [10] },
    })

    expect(screen.getByRole('heading', { name: 'Inundación' })).toBeInTheDocument()
    expect(screen.getByText('Sin cambios')).toBeInTheDocument()
    expect(screen.queryByRole('radio')).toBeNull()
    expect(screen.getByRole('button', { name: 'Cambió algo' })).toBeInTheDocument()
  })

  it('"Cambió algo" muestra los campos y "Listo" los vuelve a guardar', () => {
    renderCard({
      borrador: { ...borradorBase, categoria: 'establecimiento', motivo: 'Inundación', severidad: 'Alta', secciones: [10] },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Cambió algo' }))
    expect(screen.getByRole('radio', { name: 'Inundación' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Listo' }))
    expect(screen.queryByRole('radio')).toBeNull()
  })

  // "Retirar" nombraba lo que el sistema hace con la fila. "Ya se resolvió"
  // nombra lo que pasó en la escuela.
  it('una situación ya informada ofrece darla por resuelta, no "retirarla"', () => {
    const onResolver = vi.fn()
    renderCard({
      borrador: { ...borradorBase, categoria: 'establecimiento', motivo: 'Inundación', severidad: 'Alta', secciones: [10] },
      onResolver,
    })

    expect(screen.queryByRole('button', { name: /retirar/i })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Ya se resolvió' }))

    expect(onResolver).toHaveBeenCalledTimes(1)
  })

  it('una situación agregada ahora se descarta, no se "resuelve"', () => {
    const onResolver = vi.fn()
    renderCard({ esNueva: true, onResolver })

    expect(screen.getByText('Nueva')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Quitar de la lista' }))

    expect(onResolver).toHaveBeenCalledTimes(1)
  })

  // La consecuencia de resolver se ve en el acto y en el lugar, en vez de
  // mandar la fila a un cajón aparte al pie de la pantalla.
  it('una situación resuelta se queda en su lugar, marcada y con Deshacer', () => {
    const onDeshacer = vi.fn()
    renderCard({
      borrador: { ...borradorBase, categoria: 'establecimiento', motivo: 'Inundación', severidad: 'Alta', secciones: [10] },
      resuelta: true,
      onDeshacer,
    })

    expect(screen.getByRole('heading', { name: 'Inundación' })).toBeInTheDocument()
    expect(screen.getByText('Se resolvió')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cambió algo' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }))
    expect(onDeshacer).toHaveBeenCalledTimes(1)
  })

  it('marca como corregida la que ya figuraba en el parte y fue tocada', () => {
    renderCard({
      borrador: { ...borradorBase, categoria: 'establecimiento', motivo: 'Inundación', severidad: 'Alta', secciones: [10] },
      modificada: true,
    })

    expect(screen.getByText('Corregida')).toBeInTheDocument()
  })

  it('resumen suma la matrícula de las secciones elegidas', () => {
    renderCard({ borrador: { ...borradorBase, secciones: [10, 11] } })

    expect(screen.getByText(/Seleccionadas: 2 de \d+ secciones · 53 de \d+ alumnos/)).toBeInTheDocument()
  })

  it('resumen usa la cantidad de alumnos explícitos cuando los hay', () => {
    renderCard({ borrador: { ...borradorBase, secciones: [10, 11], alumnos: [1, 2, 3] } })

    expect(screen.getByText(/Seleccionadas: 2 de \d+ secciones · 3 de \d+ alumnos/)).toBeInTheDocument()
  })

  /*
    El aviso antes aparecía casi siempre: `detectarMotivoDuplicado` marca
    coincidencia también cuando apenas se comparte la categoría, y con varias
    situaciones cargadas eso pasa todo el tiempo. Dentro de un mismo parte
    compartir categoría es normal —una escuela puede estar inundada Y sin
    energía, las dos "establecimiento"—, así que el aviso quedó reducido a lo
    único que significa algo: el mismo motivo exacto, y sólo sobre una
    situación que se está agregando ahora.
  */
  it('avisa por badge cuando una situación NUEVA repite un motivo ya informado', () => {
    renderCard({
      esNueva: true,
      borrador: { ...borradorBase, categoria: 'establecimiento', motivo: 'Inundación' },
      otrasAfectaciones: [
        { ...borradorBase, clientId: 'a0', categoria: 'establecimiento', motivo: 'Inundación' },
      ],
    })

    expect(screen.getByText('Ya informado')).toBeInTheDocument()
    expect(screen.getByText(/mismo motivo/i)).toBeInTheDocument()
    // §18.14: recomienda, nunca decide. No es un error ni bloquea.
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it.each([
    ['no avisa cuando sólo comparten la categoría', true, 'establecimiento', 'Tormenta severa'],
    ['no avisa sobre una situación que ya figura en el parte: no la está agregando', false, 'establecimiento', 'Inundación'],
    ['no avisa cuando no hay coincidencia de motivo', true, 'alumnos', 'Anegamiento'],
  ] as const)('%s', (_titulo, esNueva, categoriaOtra, motivoOtra) => {
    renderCard({
      esNueva,
      borrador: { ...borradorBase, categoria: 'establecimiento', motivo: 'Inundación' },
      otrasAfectaciones: [
        { ...borradorBase, clientId: 'a0', categoria: categoriaOtra, motivo: motivoOtra },
      ],
    })
    expect(screen.queryByText('Ya informado')).toBeNull()
  })
})
