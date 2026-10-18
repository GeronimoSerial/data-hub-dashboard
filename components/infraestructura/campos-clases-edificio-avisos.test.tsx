// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CamposClasesEdificio, type ValorClasesEdificio } from './campos-clases-edificio'
import {
  evaluarConsistenciaParte,
  type RespuestasConsistencia,
} from '@/lib/infraestructura/consistencia-parte'

const AHORA = new Date(2026, 9, 17, 12, 0, 0)

const RESPUESTAS_BASE: RespuestasConsistencia = {
  categoria: 'establecimiento',
  motivoId: 'inundacion',
  severidad: 'Crítica',
  justificacionCritica: null,
  descripcion: '',
  alcance: { tipo: 'toda' },
  clases: null,
  edificio: null,
  asistenciaBrinda: null,
  vigencia: null,
}

const MENSAJE_HABITUAL = 'Una inundación suele afectar al edificio. Verifique que siga figurando como habitual.'
const MENSAJE_CENTRO = 'Con una inundación el edificio no puede figurar como centro de evacuados.'

// Reproduce el flujo real: las reglas se recalculan con cada cambio de respuestas.
function ConReglas({ inicial }: { inicial: ValorClasesEdificio }) {
  const [valor, setValor] = useState<ValorClasesEdificio>(inicial)
  const respuestas: RespuestasConsistencia = {
    ...RESPUESTAS_BASE,
    edificio: valor.estadoEstablecimiento || null,
    clases: valor.servicioEstado || null,
  }
  return (
    <>
      <CamposClasesEdificio
        valor={valor}
        onCambiar={setValor}
        alcanceParcial={false}
        onInterrumpirTodaLaEscuela={vi.fn()}
        respuestas={respuestas}
        advertencias={evaluarConsistenciaParte(respuestas, AHORA).advertencias}
      />
      <output data-testid="valor">{JSON.stringify(valor)}</output>
    </>
  )
}

const valor = () => JSON.parse(screen.getByTestId('valor').textContent!)
const opcion = (nombre: string) => screen.getByRole('radio', { name: nombre }).closest('label')!

afterEach(cleanup)

describe('CamposClasesEdificio: advertencias accionables (T10)', () => {
  const inicial = { servicioEstado: 'normal' as const, estadoEstablecimiento: 'habitual' as const }

  it('la advertencia aparece justo debajo de la opción que concierne', () => {
    render(<ConReglas inicial={inicial} />)

    expect(opcion('Sin daños / en uso normal').nextElementSibling).toHaveAttribute('role', 'note')
    expect(screen.getByRole('note')).toHaveTextContent(MENSAJE_HABITUAL)
  })

  it('"Cambiar a" aplica el valor sugerido y la advertencia desaparece', () => {
    render(<ConReglas inicial={inicial} />)

    fireEvent.click(screen.getByRole('button', { name: 'Cambiar a Uso parcial' }))

    expect(valor().estadoEstablecimiento).toBe('parcial')
    expect(screen.queryByText(MENSAJE_HABITUAL)).not.toBeInTheDocument()
  })

  it('"Está bien así" oculta la advertencia y vuelve si cambian las respuestas', () => {
    render(<ConReglas inicial={inicial} />)

    fireEvent.click(screen.getByRole('button', { name: 'Está bien así' }))
    expect(screen.queryByText(MENSAJE_HABITUAL)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: 'No, se suspendieron' }))
    expect(screen.getByText(MENSAJE_HABITUAL)).toBeInTheDocument()
  })
})

describe('CamposClasesEdificio: opción bloqueada con su motivo (T10)', () => {
  it('el motivo vive dentro de la opción bloqueada, una sola vez', () => {
    render(<ConReglas inicial={{ servicioEstado: '', estadoEstablecimiento: '' }} />)

    expect(screen.getByRole('radio', { name: 'Usado como centro de evacuados' })).toBeDisabled()
    expect(opcion('Usado como centro de evacuados')).toHaveTextContent(MENSAJE_CENTRO)
    expect(screen.getAllByText(MENSAJE_CENTRO)).toHaveLength(1)
    expect(screen.getByRole('radio', { name: 'Usado como centro de evacuados' })).toHaveAccessibleDescription(MENSAJE_CENTRO)
  })

  it('la opción bloqueada muestra un ícono de candado', () => {
    render(<ConReglas inicial={{ servicioEstado: '', estadoEstablecimiento: '' }} />)

    expect(opcion('Usado como centro de evacuados').querySelector('svg')).not.toBeNull()
  })

  it('una opción habilitada no muestra motivo', () => {
    render(<ConReglas inicial={{ servicioEstado: '', estadoEstablecimiento: '' }} />)

    expect(opcion('Sin daños / en uso normal').querySelector('.opcion__ayuda')).toBeNull()
  })
})
