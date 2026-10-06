// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmSheet } from './confirm-sheet'

describe('ConfirmSheet', () => {
  it('muestra título y contenido sólo cuando está abierto', () => {
    const { rerender } = render(
      <ConfirmSheet open={false} titulo="¿Seguro?" confirmarLabel="Sí" onConfirmar={() => {}} onCancelar={() => {}}>
        <p>Detalle</p>
      </ConfirmSheet>,
    )
    expect(screen.queryByText('¿Seguro?')).not.toBeInTheDocument()
    rerender(
      <ConfirmSheet open titulo="¿Seguro?" confirmarLabel="Sí" onConfirmar={() => {}} onCancelar={() => {}}>
        <p>Detalle</p>
      </ConfirmSheet>,
    )
    expect(screen.getByText('¿Seguro?')).toBeInTheDocument()
    expect(screen.getByText('Detalle')).toBeInTheDocument()
  })

  it('confirma y cancela con sus botones', () => {
    const onConfirmar = vi.fn()
    const onCancelar = vi.fn()
    render(<ConfirmSheet open titulo="T" confirmarLabel="Sí" onConfirmar={onConfirmar} onCancelar={onCancelar} />)
    fireEvent.click(screen.getByRole('button', { name: 'Sí' }))
    expect(onConfirmar).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onCancelar).toHaveBeenCalledTimes(1)
  })

  it('cerrar con Escape cuenta como cancelar', () => {
    const onCancelar = vi.fn()
    render(<ConfirmSheet open titulo="T" confirmarLabel="Sí" onConfirmar={() => {}} onCancelar={onCancelar} />)
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    expect(onCancelar).toHaveBeenCalled()
  })

  it('respeta confirmarDeshabilitado', () => {
    render(<ConfirmSheet open titulo="T" confirmarLabel="Sí" confirmarDeshabilitado onConfirmar={() => {}} onCancelar={() => {}} />)
    expect(screen.getByRole('button', { name: 'Sí' })).toBeDisabled()
  })
})
