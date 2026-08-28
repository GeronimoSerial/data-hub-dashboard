// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ConfirmDelete } from './confirm-delete'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('ConfirmDelete', () => {
  it('opens an AlertDialog and only confirms on explicit "Eliminar"', async () => {
    const onConfirm = vi.fn()
    render(
      <ConfirmDelete
        title="¿Eliminar recurso?"
        description="No se puede deshacer."
        onConfirm={onConfirm}
        triggerLabel="Eliminar recurso"
      />,
    )

    // Opening the dialog alone must not delete anything.
    fireEvent.click(screen.getByRole('button', { name: /eliminar recurso/i }))
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /¿eliminar recurso\?/i })).toBeInTheDocument()
    })
    expect(onConfirm).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /^eliminar$/i }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('cancelling closes the dialog without invoking the destructive action', async () => {
    const onConfirm = vi.fn()
    render(
      <ConfirmDelete
        title="¿Eliminar etiqueta?"
        description="Se eliminará de forma permanente."
        onConfirm={onConfirm}
        triggerLabel="Eliminar etiqueta"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /eliminar etiqueta/i }))
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /¿eliminar etiqueta\?/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /^cancelar$/i }))
    expect(onConfirm).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: /¿eliminar etiqueta\?/i })).not.toBeInTheDocument()
    })
  })

  it('renders a disabled trigger for in-use taxonomies so the dialog cannot open', () => {
    const onConfirm = vi.fn()
    render(
      <ConfirmDelete
        title="¿Eliminar nivel?"
        description="Está en uso."
        onConfirm={onConfirm}
        triggerLabel="Eliminar nivel"
        disabled
      />,
    )
    const trigger = screen.getByRole('button', { name: /eliminar nivel/i })
    expect(trigger).toBeDisabled()
    fireEvent.click(trigger)
    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.queryByRole('heading', { name: /¿eliminar nivel\?/i })).not.toBeInTheDocument()
  })

  it('renders a custom trigger when provided', async () => {
    const onConfirm = vi.fn()
    render(
      <ConfirmDelete
        title="¿Eliminar?"
        description="Confirmá."
        onConfirm={onConfirm}
        triggerLabel="Borrar ahora"
        trigger={<button type="button" aria-label="Borrar ahora">Borrar ahora</button>}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /borrar ahora/i }))
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /¿eliminar\?/i })).toBeInTheDocument()
    })
  })
})