// @vitest-environment jsdom
import * as React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TaxonomyAdmin, TaxonomyForm } from './admin-page'

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}))
vi.mock('@/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}))
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children?: React.ReactNode }) => <h2>{children}</h2>,
}))
vi.mock('@/components/confirm-delete', () => ({
  ConfirmDelete: ({ onConfirm, triggerLabel }: { onConfirm: () => void; triggerLabel: string }) => (
    <button onClick={onConfirm}>{triggerLabel}</button>
  ),
}))

const fields = [{ key: 'nombre', label: 'Nombre', type: 'text' as const }]

function formProps(onSave: (values: Record<string, unknown>) => void | Promise<boolean>) {
  return {
    title: 'Nueva categoría',
    fields,
    initial: { nombre: '' },
    onSave,
    onClose: vi.fn(),
    onRegisterClose: vi.fn(),
  }
}

describe('admin CRUD continuity', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('closes only after a successful save and keeps the form on mutation error', async () => {
    window.history.replaceState({}, '', '/admin?section=tags')
    const onClose = vi.fn()
    const failedSave = vi.fn(async () => false)
    render(<TaxonomyForm {...formProps(failedSave)} onClose={onClose} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'Área' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(failedSave).toHaveBeenCalledTimes(1))
    expect(onClose).not.toHaveBeenCalled()
    expect(input).toHaveValue('Área')

    const successfulSave = vi.fn(async () => true)
    onClose.mockReset()
    document.body.innerHTML = ''
    render(<TaxonomyForm {...formProps(successfulSave)} onClose={onClose} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Área' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(window.location.pathname + window.location.search).toBe('/admin?section=tags')
  })

  it('blocks a second submit while the first save is pending', async () => {
    let resolveSave: (value: boolean) => void = () => undefined
    const save = vi.fn(() => new Promise<boolean>((resolve) => { resolveSave = resolve }))
    const onClose = vi.fn()
    render(<TaxonomyForm {...formProps(save)} onClose={onClose} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Área' } })
    const button = screen.getByRole('button', { name: 'Guardar' })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(save).toHaveBeenCalledTimes(1)
    expect(button).toBeDisabled()
    resolveSave(true)
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('asks before discarding dirty values and exposes local list errors', async () => {
    const onClose = vi.fn()
    render(<TaxonomyForm {...formProps(async () => false)} onClose={onClose} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Área' } })
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onClose).toHaveBeenCalledTimes(1)

    render(
      <TaxonomyAdmin
        items={[{ id: 'categoria', nombre: 'Área' }]}
        columns={[{ header: 'Nombre', render: (item) => item.nombre }]}
        fields={fields}
        emptyValues={{ nombre: '' }}
        error="No se pudo guardar"
        onSave={async () => false}
        onDelete={async () => false}
        singular="categoría"
        inUse={() => 0}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo guardar')
  })

  it('deletes without changing the active section context', async () => {
    window.history.replaceState({}, '', '/admin?section=tags')
    const onDelete = vi.fn(async () => true)
    render(
      <TaxonomyAdmin
        items={[{ id: 'categoria', nombre: 'Área' }]}
        columns={[{ header: 'Nombre', render: (item) => item.nombre }]}
        fields={fields}
        emptyValues={{ nombre: '' }}
        onSave={async () => true}
        onDelete={onDelete}
        singular="categoría"
        inUse={() => 0}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar categoría' }))
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('categoria'))
    expect(window.location.pathname + window.location.search).toBe('/admin?section=tags')
  })
})
