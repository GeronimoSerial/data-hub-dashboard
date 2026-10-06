// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach } from 'vitest'
import type { AlertaRadar } from '@/lib/infraestructura/radar-meteo/alertas-agrupadas'
import { agruparAlertas } from '@/lib/infraestructura/radar-meteo/alertas-agrupadas'
import { AlertasPastilla } from './alertas-pastilla'

afterEach(cleanup)

function crearAlerta(id: string, onset: string): AlertaRadar {
  return {
    id,
    nivelSat: 'amarillo',
    severidad: 'moderada',
    evento: 'Tormentas',
    headline: 'Tormentas en Corrientes',
    description: null,
    instruction: null,
    onset,
    expires: '2099-01-02T12:00:00Z',
    departamentos: [{ id, nombre: `Departamento ${id}` }],
  }
}

describe('pastilla de alertas del SMN sobre el mapa', () => {
  it('no se muestra cuando no hay grupos', () => {
    const { container } = render(<AlertasPastilla grupos={[]} onVer={() => undefined} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('muestra una sola pastilla para nueve alertas próximas agrupadas y permite verlas', () => {
    const alertas = Array.from({ length: 9 }, (_, indice) => crearAlerta(`smn-${indice}`, `2099-01-01T12:${String(indice).padStart(2, '0')}:00Z`))
    const grupos = agruparAlertas(alertas, Date.parse('2026-10-01T00:00:00Z'))
    const onVer = vi.fn()

    render(<AlertasPastilla grupos={grupos} onVer={onVer} />)

    const botones = screen.getAllByRole('button')
    expect(botones).toHaveLength(1)
    expect(botones[0]).toHaveTextContent('alertas del SMN · próximas desde')
    fireEvent.click(botones[0])
    expect(onVer).toHaveBeenCalledOnce()
  })

  it('resume los grupos vigentes y próximos', () => {
    const grupos = agruparAlertas([
      crearAlerta('vigente-a', '2026-09-30T12:00:00Z'),
      crearAlerta('vigente-b', '2026-09-30T12:01:00Z'),
      ...Array.from({ length: 7 }, (_, indice) => crearAlerta(`proxima-${indice}`, `2099-01-01T12:${String(indice).padStart(2, '0')}:00Z`)),
    ], Date.parse('2026-10-01T00:00:00Z'))

    render(<AlertasPastilla grupos={grupos} onVer={() => undefined} />)

    expect(screen.getByRole('button')).toHaveTextContent('2 vigentes · 7 próximas')
  })
})
