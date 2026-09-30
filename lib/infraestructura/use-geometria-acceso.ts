'use client'

import { useRecursoMapaCacheado } from './use-recurso-mapa-cacheado'
import type { GeometriaAccesoRespuesta } from './territorio-mapa'

const MENSAJE_ERROR = 'No se pudo cargar el camino de esta escuela. Probá de nuevo en unos minutos.'
const ENDPOINT = 'geometria'

// Cache a nivel de módulo por cueAnexo: la geometría de una escuela no cambia
// durante la sesión y reseleccionarla no debe volver a pegarle a la API. Al
// superar 50 entradas se descarta la más antigua (orden de inserción).
const cacheGeometria = new Map<string, GeometriaAccesoRespuesta>()

// Sólo para tests: limpia el cache compartido entre casos.
export function __limpiarCacheGeometria(): void {
  cacheGeometria.clear()
}

// Geometría de acceso de UNA escuela, a demanda. No dispara request si
// `cueAnexo` es null o `habilitado` es false. Al cambiar de cue se aborta el
// pedido anterior y el render deriva `loading:true` con `data:null` mientras
// carga: nunca se muestra la geometría de la escuela previa para el cue nuevo.
export function useGeometriaAcceso(
  cueAnexo: string | null,
  habilitado: boolean,
): {
  data: GeometriaAccesoRespuesta | null
  loading: boolean
  error: string | null
} {
  return useRecursoMapaCacheado(
    cueAnexo,
    habilitado,
    ENDPOINT,
    MENSAJE_ERROR,
    cacheGeometria,
  )
}
