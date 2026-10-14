import type { Map as MapaMaplibre } from 'maplibre-gl'
import { desplazamientoPopup, type Rect } from '@/lib/mapas/desplazamiento-popup'

/** Panels and overlays drawn over the map that a click popup must never sit under. */
export const SELECTOR_OBSTACULOS_MAPA = [
  '.map-left-stack',
  '.map-ficha-flotante',
  '.map-leyenda',
  '.radar-meteo-legend',
  '.radar-meteo-timeline',
  '.radar-meteo-popup',
].join(', ')

function rect(elemento: Element): Rect {
  const { left, top, right, bottom } = elemento.getBoundingClientRect()
  return { left, top, right, bottom }
}

/**
 * Auto-pans the map whenever a click popup opens under a panel or the legend.
 * Hover tooltips (`.mapa-tooltip`) are left alone: panning under the cursor would
 * fight the pointer. Returns the disposer.
 */
export function mantenerPopupsVisibles(mapa: MapaMaplibre): () => void {
  const contenedor = mapa.getContainer()
  const raiz = contenedor.closest('.map-shell') ?? document
  let pendiente = 0

  const revisar = (popup: Element) => {
    cancelAnimationFrame(pendiente)
    pendiente = requestAnimationFrame(() => {
      if (!popup.isConnected) return
      const obstaculos = [...raiz.querySelectorAll(SELECTOR_OBSTACULOS_MAPA)]
        .filter((elemento) => !elemento.contains(popup) && elemento.getClientRects().length > 0)
        .map(rect)
      const { x, y } = desplazamientoPopup(rect(popup), obstaculos, rect(contenedor))
      if (x !== 0 || y !== 0) mapa.panBy([x === 0 ? 0 : -x, y === 0 ? 0 : -y], { duration: 300 })
    })
  }

  const observador = new MutationObserver((cambios) => {
    for (const cambio of cambios) {
      for (const nodo of cambio.addedNodes) {
        if (nodo instanceof Element && nodo.classList.contains('maplibregl-popup') && !nodo.classList.contains('mapa-tooltip')) {
          revisar(nodo)
        }
      }
    }
  })
  observador.observe(contenedor, { childList: true, subtree: true })
  return () => {
    observador.disconnect()
    cancelAnimationFrame(pendiente)
  }
}
