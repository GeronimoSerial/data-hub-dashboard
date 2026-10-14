export type Rect = { left: number; top: number; right: number; bottom: number }

function seCruzan(a: Rect, b: Rect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

function dentro(r: Rect, limite: Rect): boolean {
  return r.left >= limite.left && r.right <= limite.right && r.top >= limite.top && r.bottom <= limite.bottom
}

function mover(r: Rect, x: number, y: number): Rect {
  return { left: r.left + x, right: r.right + x, top: r.top + y, bottom: r.bottom + y }
}

/**
 * Screen offset that moves a popup out from under the panels covering the map,
 * using the smallest move per panel that keeps the popup inside the map.
 * Panning the map by the opposite offset carries the popup with its anchor.
 */
export function desplazamientoPopup(popup: Rect, obstaculos: readonly Rect[], mapa: Rect, margen = 12): { x: number; y: number } {
  // First bring the popup inside the map edges (it may open cut off at the top).
  const cabeAncho = popup.right - popup.left <= mapa.right - mapa.left - 2 * margen
  const cabeAlto = popup.bottom - popup.top <= mapa.bottom - mapa.top - 2 * margen
  let x = cabeAncho ? Math.max(0, mapa.left + margen - popup.left) || Math.min(0, mapa.right - margen - popup.right) : 0
  let y = cabeAlto ? Math.max(0, mapa.top + margen - popup.top) || Math.min(0, mapa.bottom - margen - popup.bottom) : 0
  for (const obstaculo of obstaculos) {
    const actual = mover(popup, x, y)
    if (!seCruzan(actual, obstaculo)) continue
    const candidatos = [
      { x: obstaculo.left - margen - actual.right, y: 0 },
      { x: obstaculo.right + margen - actual.left, y: 0 },
      { x: 0, y: obstaculo.top - margen - actual.bottom },
      { x: 0, y: obstaculo.bottom + margen - actual.top },
    ].filter((c) => dentro(mover(actual, c.x, c.y), mapa))
    if (candidatos.length === 0) continue
    const mejor = candidatos.reduce((a, b) => (Math.abs(a.x) + Math.abs(a.y) <= Math.abs(b.x) + Math.abs(b.y) ? a : b))
    x += mejor.x
    y += mejor.y
  }
  return { x, y }
}
