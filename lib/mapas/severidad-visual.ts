import { SEVERIDADES } from '@/lib/infraestructura/validacion'

// Todas las escuelas tienen el mismo radio. La severidad se expresa por color.
export const RADIO_DOT_BASE = 6

// Los clusters conservan la severidad más alta de sus escuelas.
export function rangoSeveridad(severidad: string): number {
  const indice = SEVERIDADES.indexOf(severidad as (typeof SEVERIDADES)[number])
  return indice === -1 ? 0 : indice
}

// ── Badge de estado por escuela (V2) ────────────────────────────────────────
//
// Un solo badge superpuesto al punto de color, en vez de anillos/halos
// apilados. El ícono comunica QUÉ pasa; el color del punto sigue comunicando
// CUÁN grave es (nunca al revés: el ícono no tiene color propio de severidad).
// Si una escuela cumple más de una condición se muestra SÓLO la de mayor
// prioridad, para no apilar íconos sobre el mismo punto.
export type IconoEstadoEscuela =
  | 'Tent'
  | 'DoorOpen'
  | 'CircleSlash'
  | 'TriangleAlert'
  | 'CircleHelp'

export interface EstadoVisualEscuela {
  // 'habitual' | 'evacuado' | 'centro_evacuados'.
  estadoEstablecimiento: string
  // 'normal' | 'parcial' | 'suspendido'.
  servicio: string
  sinReportar: boolean
}

// Orden de prioridad (de mayor a menor):
//   1. centro_evacuados  -> Tent
//   2. evacuado          -> DoorOpen
//   3. servicio suspendido -> CircleSlash
//   4. servicio parcial    -> TriangleAlert
//   5. sinReportar         -> CircleHelp
//   6. ninguna             -> null (el punto de color solo ya alcanza)
export function iconoEstadoEscuela(
  estado: EstadoVisualEscuela,
): IconoEstadoEscuela | null {
  if (estado.estadoEstablecimiento === 'centro_evacuados') return 'Tent'
  if (estado.estadoEstablecimiento === 'evacuado') return 'DoorOpen'
  if (estado.servicio === 'suspendido') return 'CircleSlash'
  if (estado.servicio === 'parcial') return 'TriangleAlert'
  if (estado.sinReportar) return 'CircleHelp'
  return null
}
