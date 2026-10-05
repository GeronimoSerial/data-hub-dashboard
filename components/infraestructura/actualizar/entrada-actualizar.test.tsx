// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EntradaActualizar } from './entrada-actualizar'

afterEach(cleanup)

const situaciones = [
  { id: 'b', motivo: 'Sin energía o agua', categoria: 'establecimiento' as const, severidad: 'Media' as const, rigeDesde: '2026-09-30T11:05:00.000Z', creadaEn: '2026-09-30T11:05:00.000Z', causadaPorId: null },
  { id: 'a', motivo: 'Evacuación preventiva', categoria: 'establecimiento' as const, severidad: 'Crítica' as const, rigeDesde: '2026-10-04T12:15:00.000Z', creadaEn: '2026-10-04T12:15:00.000Z', causadaPorId: null },
]

describe('EntradaActualizar', () => {
  it('muestra la última carga con hora, la principal destacada y las demás en orden', () => {
    render(
      <EntradaActualizar
        situaciones={situaciones}
        estadoEstablecimiento="evacuado"
        estadoServicio="suspendido"
        ultimaCarga={{ creadaEn: '2026-10-04T13:42:00.000Z', cambios: ['Se agregó "Evacuación preventiva" · Severidad Crítica'] }}
        historial={[]}
        onActualizar={() => {}}
      />,
    )
    expect(screen.getByText(/Su última carga/)).toHaveTextContent('10:42')
    const principal = screen.getByRole('region', { name: 'Situación principal' })
    expect(within(principal).getByText('Evacuación preventiva')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'También activas' })).getByText('Sin energía o agua')).toBeInTheDocument()
  })

  it('el botón principal inicia el recorrido', () => {
    const onActualizar = vi.fn()
    render(<EntradaActualizar situaciones={situaciones} estadoEstablecimiento="habitual" estadoServicio="normal" ultimaCarga={null} historial={[]} onActualizar={onActualizar} />)
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar situación' }))
    expect(onActualizar).toHaveBeenCalled()
  })
})
