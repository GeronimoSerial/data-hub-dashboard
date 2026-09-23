import { SEVERIDADES } from '@/lib/infraestructura/validacion'

// Todas las escuelas tienen el mismo radio. La severidad se expresa por color.
export const RADIO_DOT_BASE = 6

// Los clusters conservan la severidad más alta de sus escuelas.
export function rangoSeveridad(severidad: string): number {
  const indice = SEVERIDADES.indexOf(severidad as (typeof SEVERIDADES)[number])
  return indice === -1 ? 0 : indice
}
