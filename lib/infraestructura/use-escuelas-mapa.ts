'use client'

import type { EscuelasMapaPadronResultado } from './parte-mapa'
import { usePollingMapa } from './use-polling-mapa'

const RUTA_ESCUELAS = '/api/mapas/infraestructura/escuelas'

export function useEscuelasMapa(): {
  data: EscuelasMapaPadronResultado | null
  loading: boolean
  error: string | null
} {
  return usePollingMapa<EscuelasMapaPadronResultado>(RUTA_ESCUELAS, 'No se pudieron cargar las escuelas.')
}
