'use client'

import { useRecursoMapaCacheado } from './use-recurso-mapa-cacheado'
import type { CentroEvacuadosRespuesta } from './evacuacion/respuesta'

const MENSAJE_ERROR = 'No se pudo cargar el centro de evacuados más cercano. Probá de nuevo en unos minutos.'
const ENDPOINT = 'centro-evacuados'

// Cache por cueAnexo durante la sesión (el cálculo es diario).
const cache = new Map<string, CentroEvacuadosRespuesta>()

export function __limpiarCacheCentroEvacuados(): void {
  cache.clear()
}

// A demanda: sin request si `cueAnexo` es null o `habilitado` es false (se
// habilita recién al apretar "Mostrar camino al centro de evacuados más cercano").
export function useCentroEvacuados(cueAnexo: string | null, habilitado: boolean) {
  return useRecursoMapaCacheado(cueAnexo, habilitado, ENDPOINT, MENSAJE_ERROR, cache)
}
