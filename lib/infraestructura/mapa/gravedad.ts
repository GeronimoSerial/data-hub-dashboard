import { SEVERIDADES, type Severidad } from '@/lib/infraestructura/validacion'
import type { GravedadMapa } from './tipos'

export function gravedadDeSeveridad(severidad: Severidad): GravedadMapa {
  return (SEVERIDADES.indexOf(severidad) + 1) as GravedadMapa
}

export function severidadDeGravedad(gravedad: GravedadMapa): Severidad | null {
  if (gravedad === 0) return null
  return SEVERIDADES[gravedad - 1] ?? null
}
