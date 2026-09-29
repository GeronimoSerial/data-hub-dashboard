'use client'

import type { FiltrosMapa, IndicadoresMapa, ParteMapa } from './parte-mapa'
import { usePollingMapa } from './use-polling-mapa'

const RUTA_PARTES = '/api/mapas/infraestructura'

// Forma exacta de la respuesta de GET /api/mapas/infraestructura: un parte por escuela.
export interface RespuestaPartesMapa {
  partes: ParteMapa[]
  indicadores: IndicadoresMapa
}

export function useAlertas(filtros: FiltrosMapa): {
  data: RespuestaPartesMapa | null
  loading: boolean
  error: string | null
} {
  return usePollingMapa<RespuestaPartesMapa>(RUTA_PARTES, filtros, 'No se pudieron cargar los partes.')
}
