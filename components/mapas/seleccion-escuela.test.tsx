// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { SeleccionEscuela } from './seleccion-escuela'

afterEach(cleanup)

describe('SeleccionEscuela', () => {
  it('muestra la escuela seleccionada y usa botones del sistema', () => {
    render(
      <SeleccionEscuela
        nombre="Escuela 1"
        onVerFicha={() => {}}
        onQuitarSeleccion={() => {}}
      />,
    )

    expect(screen.getByRole('group', { name: 'Escuela seleccionada' })).toBeInTheDocument()
    expect(screen.getByText('Escuela seleccionada:')).toBeInTheDocument()
    expect(screen.getByText('Escuela 1')).toBeInTheDocument()
    expect(screen.getByTestId('reabrir-ficha')).toHaveClass('ui-button')
    expect(screen.getByTestId('reabrir-ficha')).toHaveTextContent('Ver ficha')
    expect(screen.getByRole('button', { name: 'Quitar selección' })).toHaveClass('ui-button')
  })

  it('envía ambas acciones a sus callbacks', () => {
    const onVerFicha = vi.fn()
    const onQuitarSeleccion = vi.fn()
    render(
      <SeleccionEscuela
        nombre="Escuela 1"
        onVerFicha={onVerFicha}
        onQuitarSeleccion={onQuitarSeleccion}
      />,
    )

    screen.getByTestId('reabrir-ficha').click()
    screen.getByTestId('quitar-seleccion').click()

    expect(onVerFicha).toHaveBeenCalledOnce()
    expect(onQuitarSeleccion).toHaveBeenCalledOnce()
  })
})
