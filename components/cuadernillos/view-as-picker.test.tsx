// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ViewAsPicker } from './view-as-picker'

afterEach(cleanup)

const candidates = [
  { userId: 'supervisor-1', name: 'Supervisora Demo', email: 'sup@example.test', capabilities: ['supervisor' as const] },
  { userId: 'cabecera-1', name: 'Cabecera Ejemplo', email: 'cab@example.test', capabilities: ['cabecera' as const, 'supervisor' as const] },
]

function openPicker(currentUserId: string | null = null) {
  const result = render(<ViewAsPicker candidates={candidates} currentUserId={currentUserId} />)
  fireEvent.click(screen.getByRole('button', { name: 'Ver como' }))
  return result
}

describe('ViewAsPicker', () => {
  it('starts closed and opens a popover from a Ver como button', () => {
    render(<ViewAsPicker candidates={candidates} currentUserId={null} />)

    const trigger = screen.getByRole('button', { name: 'Ver como' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('link', { name: /Supervisora Demo/ })).not.toBeInTheDocument()

    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('searchbox', { name: 'Buscar cuenta' })).toBeInTheDocument()
  })

  it('lists candidate accounts as links with their capabilities and no native select', () => {
    const { container } = openPicker()

    expect(container.querySelector('select')).toBeNull()
    expect(screen.getByRole('link', { name: /Supervisora Demo.*Supervisión/ })).toHaveAttribute('href', '/cuadernillos?viewAs=supervisor-1')
    expect(screen.getByRole('link', { name: /Cabecera Ejemplo.*Cabecera.*Supervisión/ })).toHaveAttribute('href', '/cuadernillos?viewAs=cabecera-1')
  })

  it('filters candidates by name or email as the admin types', () => {
    openPicker()

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar cuenta' }), { target: { value: 'cab@' } })

    expect(screen.queryByRole('link', { name: /Supervisora Demo/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Cabecera Ejemplo/ })).toBeInTheDocument()
  })

  it('says when no account matches the search', () => {
    openPicker()

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar cuenta' }), { target: { value: 'nadie' } })

    expect(screen.getByText('Ninguna cuenta coincide con la búsqueda.')).toBeInTheDocument()
  })

  it('marks the account currently being viewed', () => {
    openPicker('supervisor-1')

    expect(screen.getByRole('link', { name: /Supervisora Demo/ })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('link', { name: /Cabecera Ejemplo/ })).not.toHaveAttribute('aria-current')
  })

  it('closes on Escape', () => {
    openPicker()

    fireEvent.keyDown(screen.getByRole('searchbox', { name: 'Buscar cuenta' }), { key: 'Escape' })

    expect(screen.queryByRole('searchbox', { name: 'Buscar cuenta' })).not.toBeInTheDocument()
  })
})
