'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { FiltrosMapa } from './parte-mapa'
import { construirQueryStringFiltrosMapa } from './query-string-filtros-mapa'

const INTERVALO_POLLING_MS = 15000

export function usePollingMapa<T>(ruta: string, filtros: FiltrosMapa, mensajeError: string): {
  data: T | null
  loading: boolean
  error: string | null
} {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const filtrosRef = useRef(filtros)
  const abortRef = useRef<AbortController | null>(null)
  const intervaloRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const desmontadoRef = useRef(false)
  const primeraCargaRef = useRef(true)

  const ejecutarFetch = useCallback(async (): Promise<void> => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    if (primeraCargaRef.current && !desmontadoRef.current) setLoading(true)

    try {
      const respuesta = await fetch(`${ruta}${construirQueryStringFiltrosMapa(filtrosRef.current)}`, {
        signal: controller.signal,
        cache: 'no-cache',
        headers: { Accept: 'application/json' },
      })
      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`)
      const json = (await respuesta.json()) as T
      if (desmontadoRef.current || controller.signal.aborted) return
      // Preserve identity when polling returns an unchanged payload.
      setData((prev) => prev && JSON.stringify(prev) === JSON.stringify(json) ? prev : json)
      setError(null)
    } catch {
      if (controller.signal.aborted || desmontadoRef.current) return
      setError(mensajeError)
    } finally {
      if (abortRef.current === controller && !desmontadoRef.current) {
        primeraCargaRef.current = false
        setLoading(false)
      }
    }
  }, [mensajeError, ruta])

  const detenerIntervalo = useCallback((): void => {
    if (intervaloRef.current !== null) clearInterval(intervaloRef.current)
    intervaloRef.current = null
  }, [])

  const iniciarIntervalo = useCallback((): void => {
    detenerIntervalo()
    if (typeof document !== 'undefined' && document.hidden) return
    intervaloRef.current = setInterval(() => void ejecutarFetch(), INTERVALO_POLLING_MS)
  }, [detenerIntervalo, ejecutarFetch])

  useEffect(() => {
    desmontadoRef.current = false
    const alCambiarVisibilidad = (): void => {
      if (document.hidden) detenerIntervalo()
      else {
        void ejecutarFetch()
        iniciarIntervalo()
      }
    }
    const alEnfocar = (): void => { void ejecutarFetch() }
    document.addEventListener('visibilitychange', alCambiarVisibilidad)
    window.addEventListener('focus', alEnfocar)
    return () => {
      desmontadoRef.current = true
      document.removeEventListener('visibilitychange', alCambiarVisibilidad)
      window.removeEventListener('focus', alEnfocar)
      detenerIntervalo()
      abortRef.current?.abort()
    }
  }, [detenerIntervalo, ejecutarFetch, iniciarIntervalo])

  useEffect(() => {
    filtrosRef.current = filtros
    void ejecutarFetch()
    iniciarIntervalo()
    // The primitive dependencies preserve the existing filter refresh contract.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filtros.territorio,
    filtros.nivel,
    filtros.cueAnexo,
    filtros.motivo,
    filtros.severidad,
    filtros.categoria,
    filtros.servicio,
  ])

  return { data, loading, error }
}
