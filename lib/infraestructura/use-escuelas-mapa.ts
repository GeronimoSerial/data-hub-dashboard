'use client'

import type { EscuelasMapaResultado, FiltrosMapa } from './parte-mapa'
import { usePollingMapa } from './use-polling-mapa'

const RUTA_ESCUELAS = '/api/mapas/infraestructura/escuelas'

export function useEscuelasMapa(filtros: FiltrosMapa): {
  data: EscuelasMapaResultado | null
  loading: boolean
  error: string | null
} {
  return usePollingMapa<EscuelasMapaResultado>(RUTA_ESCUELAS, filtros, 'No se pudieron cargar las escuelas.')
}
