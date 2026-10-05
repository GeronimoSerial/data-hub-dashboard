// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Indicadores } from './indicadores'
import type { IndicadoresMapa } from '@/lib/infraestructura/parte-mapa'

afterEach(() => {
  document.body.innerHTML = ''
})

const indicadores: IndicadoresMapa = {
  escuelas: 12,
  conServicioSuspendido: 3,
  conServicioParcial: 2,
  evacuadas: 1,
  establecimientosParciales: 2,
  centrosDeEvacuados: 0,
  sinActualizar: 4,
  alumnosAlcanzados: 340,
  seccionesAlcanzadas: 18,
}

describe('Indicadores', () => {
  it('muestra los indicadores nuevos de servicio y sin actualizar', () => {
    render(<Indicadores indicadores={indicadores} loading={false} />)

    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getAllByText('2')).toHaveLength(2)
    expect(screen.getByText('Funcionamiento parcial')).toBeInTheDocument()
    expect(screen.getByText('Sin actualizar')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('340')).toBeInTheDocument()
    expect(screen.getByText('18')).toBeInTheDocument()
  })

  it('muestra "Actualizando…" sólo mientras loading es true', () => {
    const { rerender } = render(<Indicadores indicadores={indicadores} loading={true} />)
    expect(screen.getByText('Actualizando…')).toBeInTheDocument()

    rerender(<Indicadores indicadores={indicadores} loading={false} />)
    expect(screen.queryByText('Actualizando…')).not.toBeInTheDocument()
  })
})
