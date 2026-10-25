// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import type { EstadoEstablecimiento } from '@/lib/infraestructura/trayectoria-tipos'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CamposClasesEdificio, type ValorClasesEdificio } from './campos-clases-edificio'
import type { RespuestasConsistencia, Regla } from '@/lib/infraestructura/consistencia-parte'

const SIN_RESPUESTAS: RespuestasConsistencia = {
  categoria: 'establecimiento',
  motivoId: 'sin-energia-o-agua',
  severidad: 'Media',
  justificacionCritica: null,
  descripcion: '',
  alcance: { tipo: 'algunas', secciones: 2 },
  clases: null,
  edificio: null,
  asistenciaBrinda: null,
  vigencia: null,
}

function Controlado({
  alcanceParcial = false,
  onInterrumpir = vi.fn(),
  respuestas = SIN_RESPUESTAS,
  advertencias = [],
  alcanceAlgunas = false,
  esInstituto = false,
  inicial = { servicioEstado: '', estadoEstablecimiento: '' },
  estadoActual,
  afectacionesActivas,
  onConfirmarHabitual,
  bloqueos,
  bloqueosHabitualPorAfectacion,
}: {
  alcanceParcial?: boolean
  onInterrumpir?: () => void
  respuestas?: RespuestasConsistencia
  advertencias?: Regla[]
  alcanceAlgunas?: boolean
  esInstituto?: boolean
  inicial?: ValorClasesEdificio
  estadoActual?: EstadoEstablecimiento
  afectacionesActivas?: Array<{ id: string; motivo: string }>
  onConfirmarHabitual?: (decisiones: Record<string, 'solucionada' | 'sigue'>) => void
  bloqueos?: Regla[]
  bloqueosHabitualPorAfectacion?: Record<string, string>
}) {
  const [v, setV] = useState<ValorClasesEdificio>(inicial)
  return (
    <>
      <CamposClasesEdificio
        valor={v}
        onCambiar={setV}
        alcanceParcial={alcanceParcial}
        onInterrumpirTodaLaEscuela={onInterrumpir}
        respuestas={{ ...respuestas, edificio: v.estadoEstablecimiento || null, clases: v.servicioEstado || null }}
        advertencias={advertencias}
        alcanceAlgunas={alcanceAlgunas}
        esInstituto={esInstituto}
        estadoActual={estadoActual}
        afectacionesActivas={afectacionesActivas}
        onConfirmarHabitual={onConfirmarHabitual}
        bloqueos={bloqueos}
        bloqueosHabitualPorAfectacion={bloqueosHabitualPorAfectacion}
      />
      <output data-testid="v">{JSON.stringify(v)}</output>
    </>
  )
}
const v = () => JSON.parse(screen.getByTestId('v').textContent!)

afterEach(cleanup)

describe('CamposClasesEdificio', () => {
  it('no usa la palabra "funcionamiento"', () => {
    render(<Controlado />)
    expect(screen.queryByText(/funcionamiento/i)).not.toBeInTheDocument()
    expect(screen.getByText('¿Hay clases?')).toBeInTheDocument()
    expect(screen.getByText('¿Cómo está el edificio?')).toBeInTheDocument()
  })
  it('Evacuado fuerza "No, se suspendieron" y bloquea la pregunta de clases', () => {
    render(<Controlado />)
    fireEvent.click(screen.getByRole('radio', { name: 'Sí, con normalidad' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Evacuado' }))
    expect(v()).toEqual({ servicioEstado: 'suspendido', estadoEstablecimiento: 'evacuado' })
    expect(screen.getByRole('radio', { name: 'Sí, con normalidad' })).toBeDisabled()
    expect(screen.getByText('El edificio está evacuado')).toBeInTheDocument()
  })
  it('Sin clases fuerza "No, se suspendieron" y bloquea la pregunta de clases', () => {
    render(<Controlado />)
    fireEvent.click(screen.getByRole('radio', { name: 'Sí, con normalidad' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Sin clases' }))
    expect(v()).toEqual({ servicioEstado: 'suspendido', estadoEstablecimiento: 'sin_clases' })
    expect(screen.getByRole('radio', { name: 'Sí, con normalidad' })).toBeDisabled()
    expect(screen.getByText('El edificio está sin clases')).toBeInTheDocument()
  })
  it('con alcance parcial, evacuar pide confirmación; cancelar no aplica', () => {
    const onInterrumpir = vi.fn()
    render(<Controlado alcanceParcial onInterrumpir={onInterrumpir} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Evacuado' }))
    const dialogo = screen.getByRole('dialog')
    expect(within(dialogo).getByText(/interrumpe toda la escuela/)).toBeInTheDocument()
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))
    expect(v().estadoEstablecimiento).toBe('')
    expect(onInterrumpir).not.toHaveBeenCalled()
  })
  it('en un instituto el diálogo habla de todo el instituto y de carreras', () => {
    render(<Controlado alcanceParcial esInstituto onInterrumpir={vi.fn()} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Evacuado' }))
    const dialogo = screen.getByRole('dialog')
    expect(dialogo).toHaveTextContent('¿Pasamos el alcance a todo el instituto?')
    expect(within(dialogo).getByText(/interrumpe todo el instituto, pero marcó sólo algunas carreras/)).toBeInTheDocument()
    expect(within(dialogo).getByRole('button', { name: 'Sí, todo el instituto' })).toBeInTheDocument()
  })
  it('confirmar la interrupción aplica el estado y pide pasar a toda la escuela', () => {
    const onInterrumpir = vi.fn()
    render(<Controlado alcanceParcial onInterrumpir={onInterrumpir} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Usado como centro de evacuados' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sí, toda la escuela' }))
    expect(onInterrumpir).toHaveBeenCalledTimes(1)
    expect(v().estadoEstablecimiento).toBe('centro_evacuados')
  })
  it('deshabilita "Usado como centro de evacuados" con inundación y muestra el motivo', () => {
    render(<Controlado respuestas={{ ...SIN_RESPUESTAS, motivoId: 'inundacion' }} />)
    expect(screen.getByRole('radio', { name: 'Usado como centro de evacuados' })).toBeDisabled()
    expect(screen.getByText('Con una inundación el edificio no puede figurar como centro de evacuados.')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Sin daños / en uso normal' })).toBeEnabled()
  })
  it('una opción bloqueada no puede elegirse', () => {
    render(<Controlado respuestas={{ ...SIN_RESPUESTAS, motivoId: 'evacuacion-preventiva' }} />)
    const habitual = screen.getByRole('radio', { name: 'Sin daños / en uso normal' })
    expect(habitual).toBeDisabled()
    fireEvent.click(habitual)
    expect(v().estadoEstablecimiento).toBe('')
  })
  it('muestra las advertencias bajo su grupo como aviso no bloqueante', () => {
    const adv: Regla[] = [{ codigo: 'x', campo: 'clases', mensaje: 'Verifique la respuesta de clases.' }]
    render(<Controlado advertencias={adv} />)
    const aviso = screen.getByRole('note')
    expect(aviso).toHaveTextContent('Verifique la respuesta de clases.')
    expect(screen.getByRole('radio', { name: 'Sin daños / en uso normal' })).toBeEnabled()
  })
  it('con clases suspendidas y alcance en algunas secciones, lo aclara', () => {
    render(<Controlado alcanceAlgunas />)
    fireEvent.click(screen.getByRole('radio', { name: 'No, se suspendieron' }))
    expect(screen.getByText('Se suspenden las clases solo en las secciones seleccionadas')).toBeInTheDocument()
  })
})

describe('CamposClasesEdificio: salida de evacuación (T7)', () => {
  const AFECTACIONES = [
    { id: 'a', motivo: 'Inundación' },
    { id: 'b', motivo: 'Sin energía o agua' },
  ]
  const EVACUADO = { servicioEstado: 'suspendido' as const, estadoEstablecimiento: 'evacuado' as const }

  it('evacuado a habitual con afectaciones activas abre la hoja y no aplica el cambio aún', () => {
    const onConfirmarHabitual = vi.fn()
    render(<Controlado inicial={EVACUADO} estadoActual="evacuado" afectacionesActivas={AFECTACIONES} onConfirmarHabitual={onConfirmarHabitual} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Sin daños / en uso normal' }))
    const sheet = screen.getByRole('dialog')
    expect(within(sheet).getByRole('group', { name: 'Inundación' })).toBeInTheDocument()
    expect(within(sheet).getByRole('group', { name: 'Sin energía o agua' })).toBeInTheDocument()
    expect(v().estadoEstablecimiento).toBe('evacuado')
    expect(onConfirmarHabitual).not.toHaveBeenCalled()
  })

  it('bloquea Confirmar hasta que cada afectación tenga una elección y envía los ids elegidos', () => {
    const onConfirmarHabitual = vi.fn()
    render(<Controlado inicial={EVACUADO} estadoActual="evacuado" afectacionesActivas={AFECTACIONES} onConfirmarHabitual={onConfirmarHabitual} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Sin daños / en uso normal' }))
    const sheet = screen.getByRole('dialog')
    const confirmar = within(sheet).getByRole('button', { name: 'Confirmar' })
    expect(confirmar).toBeDisabled()
    fireEvent.click(within(within(sheet).getByRole('group', { name: 'Inundación' })).getByRole('radio', { name: 'Solucionada' }))
    expect(confirmar).toBeDisabled()
    fireEvent.click(within(within(sheet).getByRole('group', { name: 'Sin energía o agua' })).getByRole('radio', { name: 'Sigue activa' }))
    expect(within(sheet).getByRole('note')).toHaveTextContent('Se mantiene una afectación activa')
    expect(confirmar).toBeEnabled()
    fireEvent.click(confirmar)
    expect(onConfirmarHabitual).toHaveBeenCalledWith({ a: 'solucionada', b: 'sigue' })
    expect(v().estadoEstablecimiento).toBe('habitual')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('cancelar la hoja deja el edificio como estaba', () => {
    const onConfirmarHabitual = vi.fn()
    render(<Controlado inicial={EVACUADO} estadoActual="evacuado" afectacionesActivas={AFECTACIONES} onConfirmarHabitual={onConfirmarHabitual} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Sin daños / en uso normal' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }))
    expect(v().estadoEstablecimiento).toBe('evacuado')
    expect(onConfirmarHabitual).not.toHaveBeenCalled()
  })

  it('sin afectaciones activas aplica el cambio sin hoja', () => {
    render(<Controlado inicial={EVACUADO} estadoActual="evacuado" afectacionesActivas={[]} onConfirmarHabitual={vi.fn()} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Sin daños / en uso normal' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(v().estadoEstablecimiento).toBe('habitual')
  })

  it('muestra el bloqueo de servicio suspendido bajo las clases y la opción sigue habilitada', () => {
    render(<Controlado inicial={{ servicioEstado: 'suspendido', estadoEstablecimiento: 'habitual' }} bloqueos={[{ codigo: 'habitual-con-servicio-suspendido', campo: 'clases', mensaje: 'El servicio sigue suspendido. Para figurar como habitual, indique que las clases vuelven a dictarse.' }]} />)
    expect(screen.getByText(/El servicio sigue suspendido/)).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Sí, con normalidad' })).toBeEnabled()
  })
})

describe('CamposClasesEdificio: evacuación preventiva que se cierra en la misma actualización (T8)', () => {
  const RESPUESTAS_EVACUACION: RespuestasConsistencia = {
    ...SIN_RESPUESTAS,
    motivoId: 'evacuacion-preventiva',
    severidad: 'Crítica',
    alcance: { tipo: 'toda' },
  }
  const EVACUADO = { servicioEstado: 'suspendido' as const, estadoEstablecimiento: 'evacuado' as const }
  const EVACUACION = [{ id: 'e', motivo: 'Evacuación preventiva' }]
  const MENSAJE_EVACUACION = 'Con una evacuación preventiva el edificio no puede figurar como habitual.'

  it('Sin daños no queda deshabilitado y la hoja decide la evacuación', () => {
    const onConfirmarHabitual = vi.fn()
    render(
      <Controlado
        respuestas={RESPUESTAS_EVACUACION}
        inicial={EVACUADO}
        estadoActual="evacuado"
        afectacionesActivas={EVACUACION}
        onConfirmarHabitual={onConfirmarHabitual}
        bloqueosHabitualPorAfectacion={{ e: MENSAJE_EVACUACION }}
      />,
    )
    const sinDanos = screen.getByRole('radio', { name: 'Sin daños / en uso normal' })
    expect(sinDanos).toBeEnabled()
    fireEvent.click(sinDanos)
    const sheet = screen.getByRole('dialog')
    expect(within(sheet).getByRole('button', { name: 'Confirmar' })).toBeDisabled()
    fireEvent.click(within(within(sheet).getByRole('group', { name: 'Evacuación preventiva' })).getByRole('radio', { name: 'Solucionada' }))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Confirmar' }))
    expect(onConfirmarHabitual).toHaveBeenCalledWith({ e: 'solucionada' })
    expect(v().estadoEstablecimiento).toBe('habitual')
  })

  it('si la evacuación sigue activa, la hoja muestra el bloqueo y no deja confirmar', () => {
    const onConfirmarHabitual = vi.fn()
    render(
      <Controlado
        respuestas={RESPUESTAS_EVACUACION}
        inicial={EVACUADO}
        estadoActual="evacuado"
        afectacionesActivas={EVACUACION}
        onConfirmarHabitual={onConfirmarHabitual}
        bloqueosHabitualPorAfectacion={{ e: MENSAJE_EVACUACION }}
      />,
    )
    fireEvent.click(screen.getByRole('radio', { name: 'Sin daños / en uso normal' }))
    const sheet = screen.getByRole('dialog')
    fireEvent.click(within(within(sheet).getByRole('group', { name: 'Evacuación preventiva' })).getByRole('radio', { name: 'Sigue activa' }))
    expect(within(sheet).getByText(MENSAJE_EVACUACION)).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: 'Confirmar' })).toBeDisabled()
    expect(onConfirmarHabitual).not.toHaveBeenCalled()
  })
})
