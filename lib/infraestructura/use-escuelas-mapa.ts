'use client'

import type { EscuelasMapaPadronResultado, FiltrosMapa } from './parte-mapa'
import { usePollingMapa } from './use-polling-mapa'

const RUTA_ESCUELAS = '/api/mapas/infraestructura/escuelas'

export function useEscuelasMapa(filtros: FiltrosMapa): {
  data: EscuelasMapaPadronResultado | null
  loading: boolean
  error: string | null
} {
  return usePollingMapa<EscuelasMapaPadronResultado>(RUTA_ESCUELAS, filtros, 'No se pudieron cargar las escuelas.')
}
