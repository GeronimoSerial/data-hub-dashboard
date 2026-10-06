'use client'

import { useMemo } from 'react'
import { useFetchVigente } from '@/lib/infraestructura/use-fetch-vigente'
import { VARIABLES_RADAR, type VariableRadar } from './variables'

const RUTA = '/api/infraestructura/radar-meteo'

export interface RespuestaRadarMeteo {
  runId: string | null
  runAt: string | null
  fetchedAt: string | null
  model: string | null
  gridVersion: string
  grid: null | { espaciado: number; lat0: number; lon0: number; filas: number; columnas: number; celdas: Array<{ id: string; fila: number; columna: number; lat: number; lon: number }> }
  tiempos: string[]
  unidades: Partial<Record<VariableRadar, string>>
  valores: Partial<Record<VariableRadar | 'granizo', Array<Array<number | null>>>>
  frescura: null | { edadMinutos: number; desactualizado: boolean }
  sinDatos: boolean
  razon?: string
}

export function useRadarMeteo(opciones: { activo?: boolean; variables?: VariableRadar[]; desde?: string; hasta?: string; paso?: 1 | 3; refreshKey?: number } = {}) {
  const activo = opciones.activo ?? true
  const variables = useMemo(() => opciones.variables ?? [...VARIABLES_RADAR], [opciones.variables])
  const filtros = useMemo(() => JSON.stringify({ variables, desde: opciones.desde, hasta: opciones.hasta, paso: opciones.paso ?? 1, refreshKey: opciones.refreshKey ?? 0 }), [variables, opciones.desde, opciones.hasta, opciones.paso, opciones.refreshKey])
  return useFetchVigente<RespuestaRadarMeteo>({
    activo,
    clave: activo ? filtros : null,
    mensajeError: 'No se pudo cargar el radar meteorológico.',
    limpiarAlCargar: true,
    ejecutar: async (signal) => {
      const params = new URLSearchParams({ variables: variables.join(','), paso: String(opciones.paso ?? 1) })
      if (opciones.desde) params.set('desde', opciones.desde)
      if (opciones.hasta) params.set('hasta', opciones.hasta)
      const response = await fetch(`${RUTA}?${params}`, { signal, cache: 'no-store', headers: { Accept: 'application/json' } })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return await response.json() as RespuestaRadarMeteo
    },
    conservarRespuesta: (anterior, nueva) => JSON.stringify(anterior) === JSON.stringify(nueva),
  })
}
