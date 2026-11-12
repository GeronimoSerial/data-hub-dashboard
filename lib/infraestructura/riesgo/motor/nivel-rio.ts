import type { EvidenciaRioPrefectura } from './puertos'

// Puntaje de amenaza de un río según su estado neutral. Sin dependencias de
// ninguna fuente concreta: lo usa el núcleo (calculo.ts).

const AMENAZA_MAX_NORMAL = 33
const AMENAZA_ALERTA = 66
const AMENAZA_BONUS_CRECIENTE = 10
const AMENAZA_EVACUACION = 100

export function valorAmenazaRio(
  ev: Pick<EvidenciaRioPrefectura, 'estado' | 'lecturaM' | 'alertaM' | 'variacionM'>,
): number {
  if (ev.estado === 'evacuacion') return AMENAZA_EVACUACION
  if (ev.estado === 'alerta') {
    return AMENAZA_ALERTA + (ev.variacionM !== null && ev.variacionM > 0 ? AMENAZA_BONUS_CRECIENTE : 0)
  }
  // 'normal' y 'bajante' (sin uso hasta B13) puntúan por proporción al umbral de alerta.
  if (ev.alertaM === null || ev.alertaM <= 0) return 0
  const proporcional = Math.min(AMENAZA_MAX_NORMAL, (ev.lecturaM / ev.alertaM) * AMENAZA_MAX_NORMAL)
  return Math.round(proporcional * 10) / 10
}
