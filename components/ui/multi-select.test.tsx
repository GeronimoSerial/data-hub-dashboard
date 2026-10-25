// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MultiSelect } from './multi-select'

const opciones = [
  { value: 'a', label: 'Carrera A' },
  { value: 'b', label: 'Carrera B' },
]

describe('MultiSelect', () => {
  it('al abrir no monta una capa modal a pantalla completa sobre la tarjeta', () => {
    // La capa modal (inert) cubre toda la ventana y su recorte se reescribe en
    // cada scroll mientras el desplegable está abierto: la tarjeta de detrás
    // se repinta y titila. El desplegable no necesita bloquear la página.
    render(<MultiSelect<string> value={[]} onChange={() => {}} options={opciones} ariaLabel="Carreras" />)
    fireEvent.click(screen.getByRole('combobox', { name: 'Carreras' }))
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(document.querySelector('[data-base-ui-inert][role="presentation"]')).toBeNull()
  })
})
