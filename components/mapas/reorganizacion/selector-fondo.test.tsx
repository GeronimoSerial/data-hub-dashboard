// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BASEMAPS } from '@/lib/map-types'
import { FONDOS_PENDIENTES, FONDOS_REORGANIZACION } from '@/lib/reorganizacion/fondos'
import { SelectorFondo } from './selector-fondo'

afterEach(cleanup)

describe('SelectorFondo', () => {
  it('expone un grupo con nombre "Mapa de fondo" y una opción por fondo disponible', () => {
    render(<SelectorFondo valor="voyager" onCambio={() => {}} />)

    const grupo = screen.getByRole('group', { name: 'Mapa de fondo' })
    const opciones = within(grupo).getAllByRole('button')
    expect(opciones.map((opcion) => opcion.textContent)).toEqual(
      FONDOS_REORGANIZACION.map((fondo) => BASEMAPS[fondo.id].label),
    )
  })

  it('no renderiza fondos pendientes como opciones', () => {
    render(<SelectorFondo valor="voyager" onCambio={() => {}} />)

    for (const pendiente of FONDOS_PENDIENTES) {
      expect(screen.queryByRole('button', { name: new RegExp(pendiente.id, 'i') })).toBeNull()
    }
    expect(screen.queryByRole('button', { name: /satélite|satelital|topogr/i })).toBeNull()
  })

  it('marca como activo el fondo recibido en valor', () => {
    render(<SelectorFondo valor="positron" onCambio={() => {}} />)

    const activo = screen.getByRole('button', { name: BASEMAPS.positron.label })
    expect(activo.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: BASEMAPS.voyager.label }).getAttribute('aria-pressed')).toBe('false')
  })

  it('llama a onCambio con el id elegido al hacer clic', async () => {
    const onCambio = vi.fn()
    const user = userEvent.setup()
    render(<SelectorFondo valor="voyager" onCambio={onCambio} />)

    await user.click(screen.getByRole('button', { name: BASEMAPS.osm.label }))

    expect(onCambio).toHaveBeenCalledTimes(1)
    expect(onCambio).toHaveBeenCalledWith('osm')
  })

  it('es operable con teclado', async () => {
    const onCambio = vi.fn()
    const user = userEvent.setup()
    render(<SelectorFondo valor="voyager" onCambio={onCambio} />)

    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: BASEMAPS.osm.label }))
    await user.keyboard('{Enter}')

    expect(onCambio).toHaveBeenCalledWith('osm')
  })
})
