'use client'

import { useRecursoMapaCacheado } from './use-recurso-mapa-cacheado'
import type { ExposicionRutaRespuesta } from './exposicion-ruta'

const MENSAJE_ERROR = 'No se pudo cargar la exposición histórica de la ruta.'
const ENDPOINT = 'exposicion-inundacion'

// Cache a nivel de módulo por cueAnexo: la exposición de una escuela no cambia
// durante la sesión y reseleccionarla no debe volver a pegarle a la API. Al
// superar 50 entradas se descarta la más antigua (orden de inserción).
const cacheExposicionRuta = new Map<string, ExposicionRutaRespuesta>()

// Sólo para tests: limpia el cache compartido entre casos.
export function __limpiarCacheExposicionRuta(): void {
  cacheExposicionRuta.clear()
}

// Exposición histórica de UNA ruta escolar, a demanda. No dispara request si
// `cueAnexo` es null o `habilitado` es false. Al cambiar de cue se aborta el
// pedido anterior y el render deriva `loading:true` con `data:null` mientras
// carga: nunca se muestra la exposición de la escuela previa para el cue nuevo.
export function useExposicionRuta(
  cueAnexo: string | null,
  habilitado: boolean,
): {
  data: ExposicionRutaRespuesta | null
  loading: boolean
  error: string | null
} {
  return useRecursoMapaCacheado(
    cueAnexo,
    habilitado,
    ENDPOINT,
    MENSAJE_ERROR,
    cacheExposicionRuta,
  )
}
