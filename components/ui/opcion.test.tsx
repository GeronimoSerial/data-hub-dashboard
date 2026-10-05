// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Opcion } from './opcion'

describe('Opcion', () => {
  it('conserva un input nativo accesible y emite el cambio', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<Opcion tipo="radio" name="alcance" label="Algunas secciones" onChange={onChange} />)

    await user.click(screen.getByRole('radio', { name: 'Algunas secciones' }))

    expect(onChange).toHaveBeenCalledOnce()
    expect(screen.getByRole('radio')).toBeInstanceOf(HTMLInputElement)
  })

  it('permite una opción de casilla con estado controlado', () => {
    render(<Opcion tipo="checkbox" label="Sala 3 A" checked onChange={() => {}} />)
    expect(screen.getByRole('checkbox', { name: 'Sala 3 A' })).toBeChecked()
  })
})
