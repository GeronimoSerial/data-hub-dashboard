// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { AlertasSeccion } from './alertas-seccion'
import { agruparAlertas, type AlertaRadar, type GrupoAlertaRadar } from '@/lib/infraestructura/radar-meteo/alertas-agrupadas'

function alerta(overrides: Partial<AlertaRadar> = {}): AlertaRadar {
  return {
    id: 'alerta-1', nivelSat: 'yellow', severidad: 'Moderada', evento: 'Tormentas',
    headline: 'Alerta de tormentas', description: 'Se esperan lluvias intensas.',
    instruction: 'Evite circular.', onset: '2026-10-07T18:00:00Z', expires: '2026-10-08T06:00:00Z',
    departamentos: [], ...overrides,
  }
}

function grupos(alertas: AlertaRadar[]): GrupoAlertaRadar[] {
  return agruparAlertas(alertas, Date.parse('2026-10-06T15:00:00Z'))
}

function props(overrides: Partial<React.ComponentProps<typeof AlertasSeccion>> = {}) {
  return { grupos: [], cargando: false, error: false, claveSeleccionada: null, onSeleccionar: vi.fn(), ...overrides }
}

describe('AlertasSeccion', () => {
  afterEach(cleanup)

  it('muestra los estados de carga, error y ausencia con el texto indicado', () => {
    const cargando = render(<AlertasSeccion {...props({ cargando: true })} />)
    expect(screen.getByRole('status')).toHaveTextContent('Cargando alertas…')
    cargando.unmount()

    const error = render(<AlertasSeccion {...props({ error: true })} />)
    expect(screen.getByText('No se pudieron cargar las alertas del SMN.')).toBeInTheDocument()
    error.unmount()

    render(<AlertasSeccion {...props()} />)
    expect(screen.getByText('Sin alertas oficiales vigentes ni próximas · SMN')).toBeInTheDocument()
  })

  it('muestra dos grupos cuando nueve alertas próximas se agrupan por evento y horario', () => {
    const alertas = Array.from({ length: 9 }, (_, indice) => alerta({
      id: `alerta-${indice}`,
      evento: indice < 5 ? 'Tormentas' : 'Viento',
      departamentos: [`Departamento ${indice}`],
    }))
    const { container } = render(<AlertasSeccion {...props({ grupos: grupos(alertas) })} />)

    expect(container.querySelectorAll('.map-sitact__fila')).toHaveLength(2)
    expect(screen.getByText('Próxima · Tormentas · Moderada')).toBeInTheDocument()
    expect(screen.getByText('Próxima · Viento · Moderada')).toBeInTheDocument()
  })

  it('limita a cuatro grupos y permite expandir y contraer la lista', () => {
    const datos = grupos(Array.from({ length: 6 }, (_, indice) => alerta({
      id: `alerta-${indice}`, evento: `Evento ${indice}`, onset: `2026-10-${String(7 + indice).padStart(2, '0')}T18:00:00Z`,
    })))
    const { container } = render(<AlertasSeccion {...props({ grupos: datos })} />)

    expect(container.querySelectorAll('.map-sitact__fila')).toHaveLength(4)
    fireEvent.click(screen.getByRole('button', { name: 'Ver las 6 alertas' }))
    expect(container.querySelectorAll('.map-sitact__fila')).toHaveLength(6)
    fireEvent.click(screen.getByRole('button', { name: 'Ver menos' }))
    expect(container.querySelectorAll('.map-sitact__fila')).toHaveLength(4)
  })

  it('selecciona y deselecciona la fila y muestra detalle expandido', () => {
    const [grupo] = grupos([alerta({ departamentos: ['Capital'] })])
    const onSeleccionar = vi.fn()
    const { rerender } = render(<AlertasSeccion {...props({ grupos: [grupo], onSeleccionar })} />)
    const fila = screen.getByRole('button', { name: /Próxima · Tormentas · Moderada/ })

    fireEvent.click(fila)
    expect(onSeleccionar).toHaveBeenCalledWith(grupo.clave)

    rerender(<AlertasSeccion {...props({ grupos: [grupo], claveSeleccionada: grupo.clave, onSeleccionar })} />)
    expect(fila).toHaveAttribute('aria-expanded', 'true')
    const detalle = screen.getByRole('region', { name: 'Detalle: Tormentas' })
    expect(within(detalle).getByText('Se esperan lluvias intensas.')).toBeInTheDocument()
    expect(within(detalle).getByText('Recomendación oficial: Evite circular.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Próxima · Tormentas · Moderada/ }))
    expect(onSeleccionar).toHaveBeenLastCalledWith(null)
  })

  it('muestra departamentos unidos y sin duplicados', () => {
    const [grupo] = grupos([
      alerta({ id: 'a', departamentos: ['Capital', { id: '1', nombre: 'Bella Vista' }] }),
      alerta({ id: 'b', departamentos: [{ id: '2', nombre: 'Capital' }, 'Ituzaingó'] }),
    ])
    render(<AlertasSeccion {...props({ grupos: [grupo] })} />)

    expect(screen.getByText('Bella Vista, Capital, Ituzaingó')).toBeInTheDocument()
  })
})
