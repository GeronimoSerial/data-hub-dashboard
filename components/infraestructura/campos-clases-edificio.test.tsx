// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
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
}: {
  alcanceParcial?: boolean
  onInterrumpir?: () => void
  respuestas?: RespuestasConsistencia
  advertencias?: Regla[]
  alcanceAlgunas?: boolean
}) {
  const [v, setV] = useState<ValorClasesEdificio>({ servicioEstado: '', estadoEstablecimiento: '' })
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
