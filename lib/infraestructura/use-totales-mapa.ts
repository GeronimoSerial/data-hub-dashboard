'use client'

import type { TotalesMapaResultado } from './totales-mapa'
import { usePollingMapa } from './use-polling-mapa'

const RUTA_TOTALES = '/api/mapas/infraestructura/totales'

export function useTotalesMapa(): {
  data: TotalesMapaResultado | null
  loading: boolean
  error: string | null
} {
  return usePollingMapa<TotalesMapaResultado>(RUTA_TOTALES, 'No se pudieron cargar los totales.')
}
