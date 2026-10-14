import { describe, expect, it } from 'vitest'
import { desplazamientoPopup, type Rect } from './desplazamiento-popup'

const mapa: Rect = { left: 0, top: 0, right: 1000, bottom: 700 }

describe('desplazamientoPopup', () => {
  it('no mueve un popup que no toca ningún panel', () => {
    expect(desplazamientoPopup({ left: 400, top: 200, right: 600, bottom: 300 }, [{ left: 800, top: 400, right: 1000, bottom: 700 }], mapa)).toEqual({ x: 0, y: 0 })
  })

  it('saca el popup de la leyenda con el menor movimiento posible', () => {
    // Overlaps the legend by 50 px horizontally and 100 px vertically: moving left is cheaper.
    const popup = { left: 650, top: 500, right: 850, bottom: 600 }
    const leyenda = { left: 800, top: 400, right: 1000, bottom: 700 }
    expect(desplazamientoPopup(popup, [leyenda], mapa, 12)).toEqual({ x: -62, y: 0 })
  })

  it('descarta movimientos que sacarían el popup fuera del mapa', () => {
    // Left panel spans the full height: only moving right keeps the popup inside the map.
    const popup = { left: 300, top: 0, right: 500, bottom: 700 }
    const panel = { left: 0, top: 0, right: 420, bottom: 700 }
    expect(desplazamientoPopup(popup, [panel], mapa, 10)).toEqual({ x: 130, y: 0 })
  })

  it('resuelve varios paneles en orden', () => {
    const popup = { left: 380, top: 100, right: 560, bottom: 200 }
    const izquierdo = { left: 0, top: 0, right: 400, bottom: 700 }
    const derecho = { left: 700, top: 0, right: 1000, bottom: 700 }
    expect(desplazamientoPopup(popup, [izquierdo, derecho], mapa, 10)).toEqual({ x: 30, y: 0 })
  })

  it('primero mete dentro del mapa un popup que se abre cortado arriba', () => {
    expect(desplazamientoPopup({ left: 400, top: -40, right: 600, bottom: 160 }, [], mapa, 12)).toEqual({ x: 0, y: 52 })
  })
})
