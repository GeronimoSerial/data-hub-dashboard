'use client'

import { useEffect, useRef, useState } from 'react'
import type { GeometriaAccesoRespuesta } from './territorio-mapa'

const RUTA_BASE = '/api/mapas/infraestructura/accesos'
const MENSAJE_ERROR = 'No se pudo cargar el camino de esta escuela. Probá de nuevo en unos minutos.'
const MAX_ENTRADAS_CACHE = 50

// Cache a nivel de módulo por cueAnexo: la geometría de una escuela no cambia
// durante la sesión y reseleccionarla no debe volver a pegarle a la API. Al
// superar 50 entradas se descarta la más antigua (orden de inserción).
const cacheGeometria = new Map<string, GeometriaAccesoRespuesta>()

// Sólo para tests: limpia el cache compartido entre casos.
export function __limpiarCacheGeometria(): void {
  cacheGeometria.clear()
}

function guardarEnCache(cueAnexo: string, valor: GeometriaAccesoRespuesta): void {
  // Reinsertar mueve la clave al final para que el descarte sea "la más
  // antigua por último uso".
  cacheGeometria.delete(cueAnexo)
  cacheGeometria.set(cueAnexo, valor)

  while (cacheGeometria.size > MAX_ENTRADAS_CACHE) {
    const masAntigua = cacheGeometria.keys().next().value
    if (masAntigua === undefined) break
    cacheGeometria.delete(masAntigua)
  }
}

interface ResultadoGeometria {
  cue: string
  data: GeometriaAccesoRespuesta | null
  error: string | null
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
  const [resultado, setResultado] = useState<ResultadoGeometria | null>(null)

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

    if (cacheGeometria.has(cueAnexo)) {
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
          `${RUTA_BASE}/${encodeURIComponent(cueAnexo)}/geometria`,
          {
            signal: controller.signal,
            cache: 'no-cache',
            headers: { Accept: 'application/json' },
          },
        )

        if (!respuesta.ok) {
          throw new Error(`HTTP ${respuesta.status}`)
        }

        const json = (await respuesta.json()) as GeometriaAccesoRespuesta
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
  // geometría de la escuela anterior. El cache tiene prioridad; si el resultado
  // en estado no corresponde al cue actual, todavía no hay dato para mostrarlo.
  if (!habilitado || cueAnexo === null) {
    return { data: null, loading: false, error: null }
  }

  const enCache = cacheGeometria.get(cueAnexo)
  if (enCache !== undefined) {
    return { data: enCache, loading: false, error: null }
  }

  if (resultado?.cue === cueAnexo) {
    return { data: resultado.data, error: resultado.error, loading: false }
  }

  return { data: null, loading: true, error: null }
}
