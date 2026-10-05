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
  it('muestra la situación principal antes de la acción y deja el historial plegado', () => {
    render(
      <EntradaActualizar
        situaciones={situaciones}
        estadoEstablecimiento="evacuado"
        estadoServicio="suspendido"
        ultimaCarga={{ creadaEn: '2026-10-04T13:42:00.000Z', titulo: 'Se informó Evacuación preventiva', cambios: ['Se informó Evacuación preventiva', 'Gravedad Crítica'] }}
        historial={[{ id: 'mov-1', tipo: 'actualizacion', rol: 'director', creadaEn: '2026-10-04T13:42:00.000Z', rigeDesde: '2026-10-04T13:42:00.000Z', titulo: 'Se informó Evacuación preventiva', cambios: ['Se informó Evacuación preventiva', 'Gravedad Crítica'] }]}
        onActualizar={() => {}}
      />,
    )
    expect(screen.queryByText(/Su última carga/)).not.toBeInTheDocument()
    const principal = screen.getByRole('region', { name: 'Situación principal' })
    expect(within(principal).getByText('Evacuación preventiva')).toBeInTheDocument()
    const actualizar = screen.getByRole('button', { name: 'Actualizar el parte' })
    const historial = screen.getByRole('button', { name: 'Ver historial' })
    expect(principal.compareDocumentPosition(actualizar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(actualizar.compareDocumentPosition(historial) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(historial).toHaveAttribute('aria-haspopup', 'dialog')
    expect(document.querySelector('.linea-de-tiempo')).not.toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'También activas' })).getByText('Sin energía o agua')).toBeInTheDocument()
  })

  it('abre el historial en un panel inferior', () => {
    render(<EntradaActualizar situaciones={situaciones} estadoEstablecimiento="habitual" estadoServicio="normal" ultimaCarga={null} historial={[]} onActualizar={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver historial' }))
    expect(screen.getByRole('dialog', { name: 'Historial' })).toBeInTheDocument()
  })

  it('el botón principal inicia el recorrido', () => {
    const onActualizar = vi.fn()
    render(<EntradaActualizar situaciones={situaciones} estadoEstablecimiento="habitual" estadoServicio="normal" ultimaCarga={null} historial={[]} onActualizar={onActualizar} />)
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar el parte' }))
    expect(onActualizar).toHaveBeenCalled()
  })
})
