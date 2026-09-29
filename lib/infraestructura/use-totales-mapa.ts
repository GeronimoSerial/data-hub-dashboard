'use client'

import type { FiltrosMapa } from './parte-mapa'
import type { TotalesMapaResultado } from './totales-mapa'
import { usePollingMapa } from './use-polling-mapa'

const RUTA_TOTALES = '/api/mapas/infraestructura/totales'

export function useTotalesMapa(filtros: FiltrosMapa): {
  data: TotalesMapaResultado | null
  loading: boolean
  error: string | null
} {
  return usePollingMapa<TotalesMapaResultado>(RUTA_TOTALES, filtros, 'No se pudieron cargar los totales.')
}
