import type { Severidad } from './validacion'

// Colores del mockup (§4.4 del plan de batches). Única fuente para el mapa,
// la lista y la ficha: no se redefinen por componente.
export const SEVERIDAD_COLORES: Record<Severidad, string> = {
  Baja: '#90B4E1',
  Media: '#FACD05',
  Alta: '#E58A2B',
  Crítica: '#F4492E',
}

export const SEVERIDAD_COLOR_DEFECTO = '#90B4E1'

export function colorSeveridad(severidad: string): string {
  return (
    SEVERIDAD_COLORES[severidad as Severidad] ?? SEVERIDAD_COLOR_DEFECTO
  )
}
