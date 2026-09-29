'use client'

import { useEffect, useRef, useState } from 'react'
import type { ExposicionRutaRespuesta } from './exposicion-ruta'

const RUTA_BASE = '/api/mapas/infraestructura/accesos'
const MENSAJE_ERROR = 'No se pudo cargar la exposición histórica de la ruta.'
const MAX_ENTRADAS_CACHE = 50

// Cache a nivel de módulo por cueAnexo: la exposición de una escuela no cambia
// durante la sesión y reseleccionarla no debe volver a pegarle a la API. Al
// superar 50 entradas se descarta la más antigua (orden de inserción).
const cacheExposicionRuta = new Map<string, ExposicionRutaRespuesta>()

// Sólo para tests: limpia el cache compartido entre casos.
export function __limpiarCacheExposicionRuta(): void {
  cacheExposicionRuta.clear()
}

function guardarEnCache(cueAnexo: string, valor: ExposicionRutaRespuesta): void {
  // Reinsertar mueve la clave al final para que el descarte sea "la más
  // antigua por último uso".
  cacheExposicionRuta.delete(cueAnexo)
  cacheExposicionRuta.set(cueAnexo, valor)

  while (cacheExposicionRuta.size > MAX_ENTRADAS_CACHE) {
    const masAntigua = cacheExposicionRuta.keys().next().value
    if (masAntigua === undefined) break
    cacheExposicionRuta.delete(masAntigua)
  }
}

interface ResultadoExposicionRuta {
  cue: string
  data: ExposicionRutaRespuesta | null
  error: string | null
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
  const [resultado, setResultado] = useState<ResultadoExposicionRuta | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const desmontadoRef = useRef(false)

  useEffect(() => {
    desmontadoRef.current = false

    if (!habilitado || cueAnexo === null) {
      abortRef.current?.abort()
      abortRef.current = null
      return () => {
        desmontadoRef.current = true
      }
    }

    if (cacheExposicionRuta.has(cueAnexo)) {
      return () => {
        desmontadoRef.current = true
        abortRef.current?.abort()
      }
    }

    const controller = new AbortController()
    abortRef.current = controller

    void (async () => {
      try {
        const respuesta = await fetch(
          `${RUTA_BASE}/${encodeURIComponent(cueAnexo)}/exposicion-inundacion`,
          {
            signal: controller.signal,
            cache: 'no-cache',
            headers: { Accept: 'application/json' },
          },
        )

        if (!respuesta.ok) {
          throw new Error(`HTTP ${respuesta.status}`)
        }

        const json = (await respuesta.json()) as ExposicionRutaRespuesta
        if (controller.signal.aborted || desmontadoRef.current) return

        guardarEnCache(cueAnexo, json)
        setResultado({ cue: cueAnexo, data: json, error: null })
      } catch {
        if (controller.signal.aborted || desmontadoRef.current) return
        setResultado({ cue: cueAnexo, data: null, error: MENSAJE_ERROR })
      }
    })()

    return () => {
      desmontadoRef.current = true
      abortRef.current?.abort()
    }
  }, [cueAnexo, habilitado])

  // Derivación en render: sin cue (o deshabilitado) el consumidor nunca ve la
  // exposición de la escuela anterior. El cache tiene prioridad; si el resultado
  // en estado no corresponde al cue actual, todavía no hay dato para mostrarlo.
  if (!habilitado || cueAnexo === null) {
    return { data: null, loading: false, error: null }
  }

  const enCache = cacheExposicionRuta.get(cueAnexo)
  if (enCache !== undefined) {
    return { data: enCache, loading: false, error: null }
  }

  if (resultado?.cue === cueAnexo) {
    return { data: resultado.data, error: resultado.error, loading: false }
  }

  return { data: null, loading: true, error: null }
}
