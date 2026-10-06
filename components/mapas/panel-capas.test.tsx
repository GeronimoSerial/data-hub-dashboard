// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BASEMAPS, type BasemapId } from '@/lib/map-types'
import { CAPAS_VISIBLES_DEFAULT, type CapasVisibles } from '@/lib/infraestructura/mapa/capas'
import { PanelCapas } from './panel-capas'

afterEach(cleanup)

describe('PanelCapas', () => {
  it('muestra las opciones de mapa base y marca la seleccionada', () => {
    render(<PanelCapas value="voyager" onChange={() => {}} capasVisibles={CAPAS_VISIBLES_DEFAULT} onCapasVisiblesChange={() => {}} haySeleccion={false} />)

    expect(screen.getByRole('heading', { name: 'Mapa base' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Mapa base' })).toBeInTheDocument()
    for (const basemap of Object.values(BASEMAPS)) {
      expect(screen.getByRole('radio', { name: basemap.label })).toBeInTheDocument()
    }
    expect(screen.getByRole('radio', { name: BASEMAPS.voyager.label })).toBeChecked()
    const mapaBase = screen.getByRole('group', { name: 'Mapa base' })
    expect(within(mapaBase).getByRole('switch', { name: 'Límites de los departamentos' })).toBeChecked()
    expect(within(mapaBase).getByRole('switch', { name: 'Nombres de los departamentos' })).toBeChecked()
    const referencias = screen.getByRole('group', { name: 'Referencias' })
    expect(within(referencias).getByRole('switch', { name: 'Ruta de acceso de la escuela seleccionada' })).toBeChecked()
    expect(within(referencias).getByRole('switch', { name: 'Cruces de agua de la ruta' })).toBeChecked()
    expect(screen.getAllByText('Se muestra al seleccionar una escuela.')).toHaveLength(2)
  })

  it('notifica el mapa base elegido', async () => {
    const onChange = vi.fn<(id: BasemapId) => void>()
    render(<PanelCapas value="voyager" onChange={onChange} capasVisibles={CAPAS_VISIBLES_DEFAULT} onCapasVisiblesChange={() => {}} haySeleccion />)

    await userEvent.click(within(screen.getByRole('group', { name: 'Mapa base' })).getByRole('radio', { name: BASEMAPS.positron.label }))
    expect(onChange).toHaveBeenCalledWith('positron')
    expect(screen.queryByText('Se muestra al seleccionar una escuela.')).not.toBeInTheDocument()
  })

  it.each([
    ['Límites de los departamentos', 'limitesDepartamentos'],
    ['Nombres de los departamentos', 'nombresDepartamentos'],
    ['Ruta de acceso de la escuela seleccionada', 'rutaAcceso'],
    ['Cruces de agua de la ruta', 'crucesAgua'],
  ] as const)('actualiza %s de forma independiente', async (etiqueta, clave) => {
    const cambios = vi.fn<(visibles: CapasVisibles) => void>()
    render(<PanelCapas value="voyager" onChange={() => {}} capasVisibles={CAPAS_VISIBLES_DEFAULT} onCapasVisiblesChange={cambios} haySeleccion={false} />)

    await userEvent.click(screen.getByRole('switch', { name: etiqueta }))
    expect(cambios).toHaveBeenCalledTimes(1)
    expect(cambios).toHaveBeenCalledWith({ ...CAPAS_VISIBLES_DEFAULT, [clave]: false })
  })
})
