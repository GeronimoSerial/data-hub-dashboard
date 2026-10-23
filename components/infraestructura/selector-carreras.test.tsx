// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SelectorCarreras } from './selector-carreras'

describe('SelectorCarreras', () => {
  it('permite seleccionar más de una carrera sin alterar las opciones existentes', () => {
    const onCambiar = vi.fn()
    render(<SelectorCarreras carreras={['Tecnicatura A', 'Profesorado B']} seleccionadas={['Tecnicatura A']} onCambiar={onCambiar} />)

    expect(screen.getByRole('checkbox', { name: 'Tecnicatura A' })).toBeChecked()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Profesorado B' }))

    expect(onCambiar).toHaveBeenCalledWith(['Tecnicatura A', 'Profesorado B'])
  })

  it('expone y permite quitar selecciones que ya no están en el catálogo', () => {
    const onCambiar = vi.fn()
    render(<SelectorCarreras carreras={['Tecnicatura A']} seleccionadas={['Carrera cerrada']} onCambiar={onCambiar} />)

    expect(screen.getByRole('alert')).toHaveTextContent('Carrera cerrada')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Carrera cerrada (ya no disponible)' }))

    expect(onCambiar).toHaveBeenCalledWith([])
  })
})
