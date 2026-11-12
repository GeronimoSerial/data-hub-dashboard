// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ViewAsPicker } from './view-as-picker'

afterEach(cleanup)

const candidates = [
  { userId: 'supervisor-1', name: 'Supervisora Demo', email: 'sup@example.test', capabilities: ['supervisor' as const] },
  { userId: 'cabecera-1', name: 'Cabecera Ejemplo', email: 'cab@example.test', capabilities: ['cabecera' as const, 'supervisor' as const] },
]

describe('ViewAsPicker', () => {
  it('lists candidate accounts as links with their capabilities and no native select', () => {
    const { container } = render(<ViewAsPicker candidates={candidates} currentUserId={null} />)

    expect(container.querySelector('select')).toBeNull()
    expect(screen.getByRole('link', { name: /Supervisora Demo.*Supervisión/ })).toHaveAttribute('href', '/cuadernillos?viewAs=supervisor-1')
    expect(screen.getByRole('link', { name: /Cabecera Ejemplo.*Cabecera.*Supervisión/ })).toHaveAttribute('href', '/cuadernillos?viewAs=cabecera-1')
  })

  it('filters candidates by name or email as the admin types', () => {
    render(<ViewAsPicker candidates={candidates} currentUserId={null} />)

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar cuenta' }), { target: { value: 'cab@' } })

    expect(screen.queryByRole('link', { name: /Supervisora Demo/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Cabecera Ejemplo/ })).toBeInTheDocument()
  })

  it('says when no account matches the search', () => {
    render(<ViewAsPicker candidates={candidates} currentUserId={null} />)

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar cuenta' }), { target: { value: 'nadie' } })

    expect(screen.getByText('Ninguna cuenta coincide con la búsqueda.')).toBeInTheDocument()
  })

  it('marks the account currently being viewed', () => {
    render(<ViewAsPicker candidates={candidates} currentUserId="supervisor-1" />)

    expect(screen.getByRole('link', { name: /Supervisora Demo/ })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('link', { name: /Cabecera Ejemplo/ })).not.toHaveAttribute('aria-current')
  })
})
