// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TURNOS_FIXTURE } from '@/components/test-utils/parte-formulario'
import { RevisarSituacion, type RevisarSituacionProps } from './revisar-situacion'

const scrollOriginal = HTMLElement.prototype.scrollIntoView

afterEach(() => {
  cleanup()
  if (scrollOriginal) HTMLElement.prototype.scrollIntoView = scrollOriginal
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
})

const base = (over: Partial<RevisarSituacionProps> = {}): RevisarSituacionProps => ({
  situacion: { id: 'a', motivo: 'Inundación', categoria: 'establecimiento', severidad: 'Alta', rigeDesde: '2026-10-02T10:00:00.000Z', creadaEn: '2026-10-02T10:00:00.000Z', causadaPorId: null, secciones: [], alumnos: [] },
  turnos: TURNOS_FIXTURE,
  sugerida: 'Crítica',
  respuesta: undefined,
  faltaRespuesta: false,
  onInteractuar: vi.fn(),
  consecuencias: [],
  clasesEdificio: { servicioEstado: 'normal', estadoEstablecimiento: 'habitual' },
  onResponder: vi.fn(),
  onCambiarClasesEdificio: vi.fn(),
  onCascada: vi.fn(),
  posicion: { actual: 1, total: 2 },
  ...over,
})

describe('RevisarSituacion', () => {
  it('"Sigue igual" responde de inmediato', () => {
    const p = base()
    render(<RevisarSituacion {...p} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Sigue igual' }))
    expect(p.onResponder).toHaveBeenCalledWith({ tipo: 'sigue' })
  })

  it('"Cambió" pregunta qué cambió y muestra sólo esos bloques', () => {
    const p = base()
    render(<RevisarSituacion {...p} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Cambió' }))
    const sheet = screen.getByRole('dialog')
    fireEvent.click(within(sheet).getByRole('checkbox', { name: 'La gravedad' }))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Continuar' }))
    expect(screen.getByText('¿Qué tan grave es ahora?')).toBeInTheDocument()
    expect(screen.queryByText('¿Hay clases?')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'Crítica' }))
    expect(p.onResponder).toHaveBeenCalledWith({ tipo: 'cambio', cambio: { aspectos: ['gravedad'], severidad: 'Crítica' } })
    expect(screen.queryByRole('button', { name: 'Listo' })).not.toBeInTheDocument()
  })

  it('separa los tres bloques de cambio y distingue la gravedad actual de la sugerida', () => {
    const p = base()
    render(<RevisarSituacion {...p} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Cambió' }))
    const sheet = screen.getByRole('dialog')
    for (const name of ['La gravedad', 'A quién afecta (secciones / alumnos)', 'Las clases o el edificio']) {
      fireEvent.click(within(sheet).getByRole('checkbox', { name }))
    }
    fireEvent.click(within(sheet).getByRole('button', { name: 'Continuar' }))

    expect(screen.getByText('¿Qué tan grave es ahora?')).toBeInTheDocument()
    expect(screen.getByText('¿A quiénes afecta?')).toBeInTheDocument()
    expect(screen.getByText('¿Hay clases?')).toBeInTheDocument()
    expect(screen.getByText('¿Cómo está el edificio?')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: '¿Cómo está el edificio?' })).toBeInTheDocument()
    const actual = screen.getByRole('radio', { name: /^Alta/ }).closest('label')!
    expect(actual.querySelector('.badge-sugerido')).toHaveClass('badge', 'badge--neutral')
    expect(within(actual).getByText('Actual')).toBeInTheDocument()
    expect(within(actual).queryByText('Sugerido')).not.toBeInTheDocument()
    const sugerida = screen.getByRole('radio', { name: /^Crítica/ }).closest('label')!
    expect(within(sugerida).getByText('Sugerido')).toBeInTheDocument()
  })

  it('muestra “Actual” cuando la gravedad sugerida coincide con la actual', () => {
    const p = base({ sugerida: 'Alta' })
    render(<RevisarSituacion {...p} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Cambió' }))
    const sheet = screen.getByRole('dialog')
    fireEvent.click(within(sheet).getByRole('checkbox', { name: 'La gravedad' }))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Continuar' }))

    const actual = screen.getByRole('radio', { name: /^Alta/ }).closest('label')!
    expect(within(actual).getByText('Actual')).toBeInTheDocument()
    expect(within(actual).queryByText('Sugerido')).not.toBeInTheDocument()
  })

  it('restaura y modifica carreras sin fabricar secciones ni alumnos', () => {
    const p = base({
      carrerasDisponibles: ['Tecnicatura A', 'Profesorado B'],
      situacion: { ...base().situacion, carreras: ['Tecnicatura A'] },
    })
    render(<RevisarSituacion {...p} />)

    fireEvent.click(screen.getByRole('radio', { name: 'Cambió' }))
    const sheet = screen.getByRole('dialog')
    fireEvent.click(within(sheet).getByRole('checkbox', { name: 'Las carreras afectadas' }))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Continuar' }))
    expect(screen.getByRole('checkbox', { name: 'Tecnicatura A' })).toBeChecked()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Profesorado B' }))

    expect(p.onResponder).toHaveBeenLastCalledWith({
      tipo: 'cambio',
      cambio: { aspectos: ['alcance'], carreras: ['Tecnicatura A', 'Profesorado B'] },
    })
  })

  it('expone una carrera obsoleta del borrador para quitarla y elegir las vigentes', () => {
    const p = base({
      carrerasDisponibles: ['Tecnicatura A'],
      situacion: { ...base().situacion, carreras: ['Carrera cerrada'] },
    })
    render(<RevisarSituacion {...p} />)

    fireEvent.click(screen.getByRole('radio', { name: 'Cambió' }))
    const sheet = screen.getByRole('dialog')
    fireEvent.click(within(sheet).getByRole('checkbox', { name: 'Las carreras afectadas' }))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Continuar' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Carrera cerrada')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Carrera cerrada (ya no disponible)' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Tecnicatura A' }))

    expect(p.onResponder).toHaveBeenLastCalledWith({
      tipo: 'cambio',
      cambio: { aspectos: ['alcance'], carreras: ['Tecnicatura A'] },
    })
  })

  it('cancelar “¿Qué cambió?” conserva “Sigue igual” sin aplicar bloques de edición', () => {
    const p = base({ respuesta: { tipo: 'sigue' } })
    render(<RevisarSituacion {...p} />)

    fireEvent.click(screen.getByRole('radio', { name: 'Cambió' }))
    const sheet = screen.getByRole('dialog', { name: '¿Qué cambió en Inundación?' })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Cancelar' }))

    expect(p.onResponder).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Sigue igual' })).toBeChecked()
    expect(screen.queryByText('¿Qué tan grave es ahora?')).not.toBeInTheDocument()
  })

  it('"Se solucionó" queda respondido con "Ahora" y pregunta en cascada sin un botón interno', () => {
    const scrollIntoView = vi.fn()
    HTMLElement.prototype.scrollIntoView = scrollIntoView
    const p = base({ consecuencias: [{ id: 'b', motivo: 'Sin energía o agua', categoria: 'establecimiento', severidad: 'Media', rigeDesde: '2026-10-03T10:00:00.000Z', creadaEn: '2026-10-03T10:00:00.000Z', causadaPorId: 'a' }] })
    render(<RevisarSituacion {...p} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Se solucionó' }))
    expect(screen.getByText('¿Cuándo se solucionó?')).toBeInTheDocument()
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
    expect(p.onResponder).toHaveBeenCalledWith({ tipo: 'solucionada', solucionadaEn: expect.any(String) })
    expect(screen.queryByRole('button', { name: 'Listo' })).not.toBeInTheDocument()
    const sheet = screen.getByRole('dialog')
    expect(within(sheet).getByText(/Sin energía o agua \(causado por Inundación\)/)).toBeInTheDocument()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Sí, también se solucionó' }))
    expect(p.onCascada).toHaveBeenCalledWith('b', expect.any(String))
  })

  it('en la cascada "No, sigue activo" no responde la consecuencia y conserva una sola respuesta solucionada', () => {
    const p = base({ consecuencias: [{ id: 'b', motivo: 'Sin energía o agua', categoria: 'establecimiento', severidad: 'Media', rigeDesde: '2026-10-03T10:00:00.000Z', creadaEn: '2026-10-03T10:00:00.000Z', causadaPorId: 'a' }] })
    render(<RevisarSituacion {...p} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Se solucionó' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'No, sigue activo' }))

    expect(p.onCascada).not.toHaveBeenCalled()
    expect(p.onResponder).toHaveBeenCalledTimes(1)
    expect(p.onResponder).toHaveBeenCalledWith({ tipo: 'solucionada', solucionadaEn: expect.any(String) })
  })
})

describe('RevisarSituacion: consistencia de la actualización (T7)', () => {
  it('deshabilita "Usado como centro de evacuados" con inundación y muestra el motivo', () => {
    const p = base({ motivoId: 'inundacion' })
    render(<RevisarSituacion {...p} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Cambió' }))
    const sheet = screen.getByRole('dialog')
    fireEvent.click(within(sheet).getByRole('checkbox', { name: 'Las clases o el edificio' }))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Continuar' }))
    expect(screen.getByRole('radio', { name: 'Usado como centro de evacuados' })).toBeDisabled()
    expect(screen.getByRole('radio', { name: 'Sin daños / en uso normal' })).toBeEnabled()
  })

  it('pasa las decisiones de afectaciones al confirmar la hoja de evacuado a habitual', () => {
    const onDecidirAfectacionesHabitual = vi.fn()
    const p = base({
      clasesEdificio: { servicioEstado: 'normal', estadoEstablecimiento: 'evacuado' },
      estadoActual: 'evacuado',
      afectacionesActivas: [{ id: 'a', motivo: 'Inundación' }, { id: 'b', motivo: 'Sin energía o agua' }],
      onDecidirAfectacionesHabitual,
    })
    render(<RevisarSituacion {...p} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Cambió' }))
    const sheet = screen.getByRole('dialog')
    fireEvent.click(within(sheet).getByRole('checkbox', { name: 'Las clases o el edificio' }))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Continuar' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Sin daños / en uso normal' }))
    fireEvent.click(within(within(screen.getByRole('dialog')).getByRole('group', { name: 'Inundación' })).getByRole('radio', { name: 'Solucionada' }))
    fireEvent.click(within(within(screen.getByRole('dialog')).getByRole('group', { name: 'Sin energía o agua' })).getByRole('radio', { name: 'Sigue activa' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirmar' }))
    expect(onDecidirAfectacionesHabitual).toHaveBeenCalledWith({ a: 'solucionada', b: 'sigue' })
  })
})

it('al actualizar alumnos sólo permite cambiar el alcance y recalcula su prioridad', () => {
  const p = base()
  p.situacion = { ...p.situacion, motivo: 'Anegamiento', categoria: 'alumnos', secciones: [10], alumnos: [1001] }
  render(<RevisarSituacion {...p} />)
  fireEvent.click(screen.getByRole('radio', { name: 'Cambió' }))
  const sheet = screen.getByRole('dialog')
  expect(within(sheet).queryByRole('checkbox', { name: 'La gravedad' })).not.toBeInTheDocument()
  expect(within(sheet).queryByRole('checkbox', { name: 'Las clases o el edificio' })).not.toBeInTheDocument()
  fireEvent.click(within(sheet).getByRole('checkbox', { name: 'A quién afecta (secciones / alumnos)' }))
  fireEvent.click(within(sheet).getByRole('button', { name: 'Continuar' }))
  expect(screen.getByText(/1 de 83 alumnos · 1,2% · Prioridad Baja/)).toBeInTheDocument()
  expect(p.onResponder).toHaveBeenLastCalledWith({ tipo: 'cambio', cambio: { aspectos: ['alcance'], secciones: [10], alumnos: [1001] } })
})
