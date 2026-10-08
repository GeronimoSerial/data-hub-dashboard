'use client'

import { useMemo } from 'react'
import { useFetchVigente } from '@/lib/infraestructura/use-fetch-vigente'

const RUTA = '/api/infraestructura/radar-meteo/corridas'

export interface CorridaRadarMeteo {
  id: string
  runAt: string
  fetchedAt: string
}

export interface RespuestaCorridasRadarMeteo {
  corridas: CorridaRadarMeteo[]
}

export function useCorridasRadarMeteo(opciones: { activo?: boolean; refreshKey?: number } = {}) {
  const activo = opciones.activo ?? true
  const clave = useMemo(() => JSON.stringify({ refreshKey: opciones.refreshKey ?? 0 }), [opciones.refreshKey])
  return useFetchVigente<RespuestaCorridasRadarMeteo>({
    activo,
    clave: activo ? clave : null,
    mensajeError: 'No se pudieron cargar las corridas del radar.',
    limpiarAlCargar: true,
    ejecutar: async (signal) => {
      const response = await fetch(RUTA, { signal, cache: 'no-store', headers: { Accept: 'application/json' } })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return await response.json() as RespuestaCorridasRadarMeteo
    },
    conservarRespuesta: (anterior, nueva) => JSON.stringify(anterior) === JSON.stringify(nueva),
  })
}
