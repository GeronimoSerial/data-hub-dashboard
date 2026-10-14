// Día civil de Argentina (ART, UTC−3 sin horario de verano). Todos los agregados
// del veredicto diario se calculan sobre `[00:00, 24:00)` ART, que en UTC es
// `[03:00Z del día, 03:00Z del día siguiente)`. Se hace aritmética a mano en
// lugar de depender de Intl/zonas horarias: ART no tiene DST desde 2009.

const DESPLAZAMIENTO_ART_MS = 3 * 60 * 60 * 1000
const MS_POR_DIA = 24 * 60 * 60 * 1000

/** Ventana UTC `[desde, hasta)` del día civil ART `fecha` (formato YYYY-MM-DD). */
export function rangoUtcDeDiaArt(fecha: string): { desde: string; hasta: string } {
  const inicio = Date.parse(`${fecha}T00:00:00.000Z`) + DESPLAZAMIENTO_ART_MS
  return {
    desde: new Date(inicio).toISOString(),
    hasta: new Date(inicio + MS_POR_DIA).toISOString(),
  }
}

/** Día civil ART (YYYY-MM-DD) al que pertenece un instante. */
export function fechaArt(instante: Date): string {
  return new Date(instante.getTime() - DESPLAZAMIENTO_ART_MS).toISOString().slice(0, 10)
}

/** Suma `n` días (puede ser negativo) a una fecha YYYY-MM-DD, en calendario civil. */
export function sumarDias(fecha: string, n: number): string {
  return new Date(Date.parse(`${fecha}T00:00:00.000Z`) + n * MS_POR_DIA)
    .toISOString()
    .slice(0, 10)
}
