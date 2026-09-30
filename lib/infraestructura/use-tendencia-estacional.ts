'use client'

import { useFetchVigente } from './use-fetch-vigente'

// Hook de lectura de la capa opcional "Perspectiva 30-90 días" (Open-Meteo
// Seasonal, batch SEASONAL). Copia deliberada del patrón de use-radar.ts:
// AbortController para cancelar el request anterior, comparación por
// JSON.stringify para no reemplazar la referencia si la respuesta no cambió,
// y gating con `activo` (nunca condicional en el hook, regla de hooks) para
// que apagar el flag o salir de modo Radar no dispare ningún request.

const RUTA_TENDENCIA_ESTACIONAL = '/api/infraestructura/tendencia-estacional'
const MENSAJE_ERROR = 'No se pudo cargar la perspectiva estacional.'

export interface TendenciaEstacionalItem {
  departamento: string
  variable: string
  emisionEn: string
  validoDesde: string
  validoHasta: string
  horizonteDesdeDias: number
  horizonteHastaDias: number
  model: string
  miembrosTotal: number
  miembrosValidos: number
  mediaMm: number | null
  medianaMm: number | null
  dispersionMm: number | null
  probabilidadSobreNormal: number | null
}

export function useTendenciaEstacional(
  departamento: string | null,
  activo: boolean,
): {
  data: TendenciaEstacionalItem | null
  loading: boolean
  error: string | null
} {
  return useFetchVigente<TendenciaEstacionalItem | null>({
    activo,
    clave: departamento,
    mensajeError: MENSAJE_ERROR,
    ejecutar: async (signal) => {
      if (departamento === null) throw new Error('Departamento requerido')
      const query = new URLSearchParams({ departamento }).toString()
      const respuesta = await fetch(`${RUTA_TENDENCIA_ESTACIONAL}?${query}`, {
        signal,
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      })
      if (respuesta.status === 403) {
        // La ruta es exclusiva para personal; para consulta la falta de acceso es esperada.
        return null
      }
      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`)
      const json = (await respuesta.json()) as { items: TendenciaEstacionalItem[] }
      return json.items[0] ?? null
    },
    conservarRespuesta: (anterior, nueva) => JSON.stringify(anterior) === JSON.stringify(nueva),
  })
}
