// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Map as MapaMaplibre } from 'maplibre-gl'
import { mantenerPopupsVisibles } from './popups-visibles'

function conRect(elemento: HTMLElement, r: { left: number; top: number; right: number; bottom: number }) {
  elemento.getBoundingClientRect = () => ({ ...r, x: r.left, y: r.top, width: r.right - r.left, height: r.bottom - r.top, toJSON: () => r })
  elemento.getClientRects = () => [elemento.getBoundingClientRect()] as unknown as DOMRectList
  return elemento
}

function escenario() {
  const shell = document.createElement('div')
  shell.className = 'map-shell'
  const contenedor = conRect(document.createElement('div'), { left: 0, top: 0, right: 1000, bottom: 700 })
  const leyenda = conRect(document.createElement('aside'), { left: 800, top: 400, right: 1000, bottom: 700 })
  leyenda.className = 'map-leyenda'
  shell.append(contenedor, leyenda)
  document.body.append(shell)
  const panBy = vi.fn()
  const mapa = { getContainer: () => contenedor, panBy } as unknown as MapaMaplibre
  return { contenedor, panBy, mapa }
}

const esperarCuadro = () => new Promise((resolver) => requestAnimationFrame(() => resolver(undefined)))

describe('mantenerPopupsVisibles', () => {
  afterEach(() => { document.body.innerHTML = '' })

  it('desplaza el mapa cuando un popup de clic se abre debajo de la leyenda', async () => {
    const { contenedor, panBy, mapa } = escenario()
    const soltar = mantenerPopupsVisibles(mapa)
    const popup = conRect(document.createElement('div'), { left: 650, top: 500, right: 850, bottom: 600 })
    popup.className = 'maplibregl-popup'
    contenedor.append(popup)
    await Promise.resolve()
    await esperarCuadro()
    expect(panBy).toHaveBeenCalledWith([62, 0], { duration: 300 })
    soltar()
  })

  it('no mueve el mapa por un tooltip de hover', async () => {
    const { contenedor, panBy, mapa } = escenario()
    const soltar = mantenerPopupsVisibles(mapa)
    const tooltip = conRect(document.createElement('div'), { left: 650, top: 500, right: 850, bottom: 600 })
    tooltip.className = 'maplibregl-popup mapa-tooltip'
    contenedor.append(tooltip)
    await Promise.resolve()
    await esperarCuadro()
    expect(panBy).not.toHaveBeenCalled()
    soltar()
  })
})
