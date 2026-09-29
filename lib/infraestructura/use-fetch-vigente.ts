'use client'

import { useEffect, useRef, useState } from 'react'

interface Resultado<T> {
  data: T | null
  error: string | null
}

interface OpcionesFetchVigente<T> {
  activo: boolean
  clave: string | null
  ejecutar: (signal: AbortSignal) => Promise<T>
  mensajeError: string
  limpiarAlCargar?: boolean
  limpiarAlFallar?: boolean
  conservarRespuesta?: (anterior: T, nueva: T) => boolean
}

// Centraliza cancelación, descarte de respuestas obsoletas y enmascarado
// cuando el recurso deja de estar vigente. El consumidor conserva sus reglas
// específicas para construir y transformar la respuesta.
export function useFetchVigente<T>({
  activo,
  clave,
  ejecutar,
  mensajeError,
  limpiarAlCargar = false,
  limpiarAlFallar = false,
  conservarRespuesta,
}: OpcionesFetchVigente<T>): {
  data: T | null
  loading: boolean
  error: string | null
} {
  const [resultado, setResultado] = useState<Resultado<T>>({ data: null, error: null })
  const [loading, setLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const desmontadoRef = useRef(false)
  const claveRef = useRef(clave)
  const ejecutarRef = useRef(ejecutar)
  const opcionesRef = useRef({ mensajeError, limpiarAlCargar, limpiarAlFallar, conservarRespuesta })

  useEffect(() => {
    ejecutarRef.current = ejecutar
    claveRef.current = clave
    opcionesRef.current = { mensajeError, limpiarAlCargar, limpiarAlFallar, conservarRespuesta }
  }, [clave, ejecutar, mensajeError, limpiarAlCargar, limpiarAlFallar, conservarRespuesta])

  useEffect(() => {
    // Reset for StrictMode's effect replay; each cleanup aborts the request
    // associated with that effect before the next setup begins.
    desmontadoRef.current = false
    if (!activo || clave === null) {
      abortRef.current?.abort()
      abortRef.current = null
      return () => {
        desmontadoRef.current = true
      }
    }

    const controller = new AbortController()
    abortRef.current?.abort()
    abortRef.current = controller
    if (!desmontadoRef.current) {
      if (opcionesRef.current.limpiarAlCargar) setResultado({ data: null, error: null })
      setLoading(true)
    }

    // Keep async state updates in the request callback rather than directly
    // in the effect body to satisfy react-hooks/set-state-in-effect.
    void (async () => {
      try {
        const data = await ejecutarRef.current(controller.signal)
        if (desmontadoRef.current || controller.signal.aborted || claveRef.current !== clave) return
        setResultado((anterior) => ({
          data: anterior.data !== null && opcionesRef.current.conservarRespuesta?.(anterior.data, data)
            ? anterior.data
            : data,
          error: null,
        }))
      } catch {
        if (controller.signal.aborted || desmontadoRef.current || claveRef.current !== clave) return
        setResultado((anterior) => ({
          data: opcionesRef.current.limpiarAlFallar ? null : anterior.data,
          error: opcionesRef.current.mensajeError,
        }))
      } finally {
        if (abortRef.current === controller && !desmontadoRef.current) setLoading(false)
      }
    })()

    return () => {
      desmontadoRef.current = true
      abortRef.current?.abort()
    }
  }, [activo, clave])

  // Masking keeps inactive consumers from seeing stale data without resetting
  // state synchronously in an effect (react-hooks/set-state-in-effect).
  return !activo || clave === null
    ? { data: null, loading: false, error: null }
    : { ...resultado, loading }
}
