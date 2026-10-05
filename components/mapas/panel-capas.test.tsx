// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BASEMAPS, type BasemapId } from '@/lib/map-types'
import { PanelCapas } from './panel-capas'

afterEach(cleanup)

describe('PanelCapas', () => {
  it('muestra las opciones de mapa base y marca la seleccionada', () => {
    render(<PanelCapas value="voyager" onChange={() => {}} />)

    expect(screen.getByRole('heading', { name: 'Mapa base' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Mapa base' })).toBeInTheDocument()
    for (const basemap of Object.values(BASEMAPS)) {
      expect(screen.getByRole('radio', { name: basemap.label })).toBeInTheDocument()
    }
    expect(screen.getByRole('radio', { name: BASEMAPS.voyager.label })).toBeChecked()
  })

  it('notifica el mapa base elegido', async () => {
    const onChange = vi.fn<(id: BasemapId) => void>()
    render(<PanelCapas value="voyager" onChange={onChange} />)

    await userEvent.click(within(screen.getByRole('group', { name: 'Mapa base' })).getByRole('radio', { name: BASEMAPS.positron.label }))
    expect(onChange).toHaveBeenCalledWith('positron')
  })
})
