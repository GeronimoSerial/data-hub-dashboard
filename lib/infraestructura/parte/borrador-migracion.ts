/**
 * Versión de la numeración de pasos del asistente "Cargar una situación".
 *
 * - Sin versión (borradores anteriores): 1 ¿Qué pasó? · 2 ¿A quiénes afecta? ·
 *   3 Clases y edificio (con "desde cuándo") · 4 Confirmar.
 * - Versión 2: el "desde cuándo" tiene su propio paso, así que Confirmar pasa
 *   a ser el 5 y el 4 es "¿Desde cuándo?".
 */
export const VERSION_BORRADOR_ACTUAL = 2

const PASO_CONFIRMAR_ANTERIOR = 4
const PASO_CONFIRMAR_ACTUAL = 5

/**
 * Traduce un número de paso guardado (en el borrador o en el historial del
 * navegador) a la numeración vigente. El paso 3 viejo sigue siendo "Clases y
 * edificio" y los pasos 1 y 2 no cambian; sólo Confirmar se corre.
 */
export function migrarPasoBorrador(paso: number, version: number | undefined): number {
  if ((version ?? 1) >= VERSION_BORRADOR_ACTUAL) return paso
  return paso === PASO_CONFIRMAR_ANTERIOR ? PASO_CONFIRMAR_ACTUAL : paso
}
