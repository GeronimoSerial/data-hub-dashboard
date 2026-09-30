'use client'

import { useEffect, useRef, useState } from 'react'

const RUTA_BASE = '/api/mapas/infraestructura/accesos'
const MAX_ENTRADAS_CACHE = 50

interface Resultado<T> {
  cue: string
  data: T | null
  error: string | null
}

interface Recurso<T> {
  data: T | null
  loading: boolean
  error: string | null
}

// Fetch y estado compartidos por los recursos cartográficos de acceso. Cada
// hook conserva su propio Map, endpoint y mensaje de error.
export function useRecursoMapaCacheado<T>(
  cueAnexo: string | null,
  habilitado: boolean,
  endpoint: string,
  mensajeError: string,
  cache: Map<string, T>,
): Recurso<T> {
  const [resultado, setResultado] = useState<Resultado<T> | null>(null)
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

    if (cache.has(cueAnexo)) {
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
          `${RUTA_BASE}/${encodeURIComponent(cueAnexo)}/${endpoint}`,
          {
            signal: controller.signal,
            cache: 'no-cache',
            headers: { Accept: 'application/json' },
          },
        )

        if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`)

        const json = (await respuesta.json()) as T
        if (controller.signal.aborted || desmontadoRef.current) return

        cache.delete(cueAnexo)
        cache.set(cueAnexo, json)
        while (cache.size > MAX_ENTRADAS_CACHE) {
          const masAntigua = cache.keys().next().value
          if (masAntigua === undefined) break
          cache.delete(masAntigua)
        }
        setResultado({ cue: cueAnexo, data: json, error: null })
      } catch {
        if (controller.signal.aborted || desmontadoRef.current) return
        setResultado({ cue: cueAnexo, data: null, error: mensajeError })
      }
    })()

    return () => {
      desmontadoRef.current = true
      abortRef.current?.abort()
    }
  }, [cueAnexo, habilitado, endpoint, mensajeError, cache])

  if (!habilitado || cueAnexo === null) {
    return { data: null, loading: false, error: null }
  }

  const enCache = cache.get(cueAnexo)
  if (enCache !== undefined) return { data: enCache, loading: false, error: null }

  if (resultado?.cue === cueAnexo) {
    return { data: resultado.data, error: resultado.error, loading: false }
  }

  return { data: null, loading: true, error: null }
}
