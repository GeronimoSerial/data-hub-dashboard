// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AdminPage } from './admin-page'

vi.mock('@/components/hub-data', () => ({
  useHubData: () => ({
    recursos: [], niveles: [], tipos: [], categorias: [], tags: [], writeError: null,
    upsertNivel: vi.fn(), removeNivel: vi.fn(), upsertTipo: vi.fn(), removeTipo: vi.fn(),
    upsertCategoria: vi.fn(), removeCategoria: vi.fn(), upsertTag: vi.fn(), removeTag: vi.fn(),
  }),
}))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

describe('AdminPage', () => {
  it('mantiene la tabla de motivos dentro de su área y muestra el título y la gravedad sugerida', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ motivos: [] }) }))
    render(<AdminPage role="admin" />)

    fireEvent.click(screen.getByRole('tab', { name: 'Motivos' }))
    expect(await screen.findByRole('table', { name: 'Administración de motivos' })).toBeInTheDocument()
    expect(screen.queryByText('Modelo único')).not.toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Gravedad sugerida' })).toBeInTheDocument()
    expect(screen.getByTestId('admin-motivos-table-wrap')).toHaveClass('admin-motivos__table-wrap')

    fireEvent.click(screen.getByRole('button', { name: 'Agregar motivo' }))
    const title = await screen.findByRole('heading', { name: 'Nuevo motivo' })
    expect(title).toHaveClass('motivo-form__title')
    expect(title.nextElementSibling).toHaveClass('ui-form-grid')
    expect(screen.getAllByText('Gravedad sugerida')).toHaveLength(2)
  })
})
