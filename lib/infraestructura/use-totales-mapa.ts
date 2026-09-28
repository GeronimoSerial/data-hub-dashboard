'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { FiltrosMapa } from './parte-mapa'
import { construirQueryStringFiltrosMapa } from './query-string-filtros-mapa'
import type { TotalesMapaResultado } from './totales-mapa'

const RUTA_TOTALES = '/api/mapas/infraestructura/totales'
const INTERVALO_POLLING_MS = 15000
const MENSAJE_ERROR = 'No se pudieron cargar los totales.'

// Mismo patrón que useAlertas (polling cada 15s, AbortController, pausa con
// document.hidden, refetch en focus y dedupe por JSON.stringify), apuntando a
// los agregados por departamento y provincia del mapa.
export function useTotalesMapa(filtros: FiltrosMapa): {
  data: TotalesMapaResultado | null
  loading: boolean
  error: string | null
} {
  const [data, setData] = useState<TotalesMapaResultado | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const filtrosRef = useRef<FiltrosMapa>(filtros)
  const abortRef = useRef<AbortController | null>(null)
  const intervaloRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const desmontadoRef = useRef(false)
  const primeraCargaRef = useRef(true)

  const ejecutarFetch = useCallback(async (): Promise<void> => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    if (primeraCargaRef.current && !desmontadoRef.current) {
      setLoading(true)
    }

    try {
      const respuesta = await fetch(
        `${RUTA_TOTALES}${construirQueryStringFiltrosMapa(filtrosRef.current)}`,
        {
          signal: controller.signal,
          cache: 'no-cache',
          headers: { Accept: 'application/json' },
        },
      )

      if (!respuesta.ok) {
        throw new Error(`HTTP ${respuesta.status}`)
      }

      const json = (await respuesta.json()) as TotalesMapaResultado

      if (desmontadoRef.current || controller.signal.aborted) return

      // El polling devuelve objetos nuevos aun cuando los totales no
      // cambiaron. Mantener la referencia evita recalcular agregados y
      // re-renderizar el panel cada 15 segundos sin un cambio real.
      setData((prev) => prev && JSON.stringify(prev) === JSON.stringify(json) ? prev : json)
      setError(null)
    } catch {
      if (controller.signal.aborted || desmontadoRef.current) return
      setError(MENSAJE_ERROR)
    } finally {
      if (abortRef.current === controller && !desmontadoRef.current) {
        primeraCargaRef.current = false
        setLoading(false)
      }
    }
  }, [])

  const detenerIntervalo = useCallback((): void => {
    if (intervaloRef.current !== null) {
      clearInterval(intervaloRef.current)
      intervaloRef.current = null
    }
  }, [])

  const iniciarIntervalo = useCallback((): void => {
    detenerIntervalo()

    if (typeof document !== 'undefined' && document.hidden) return

    intervaloRef.current = setInterval(() => {
      void ejecutarFetch()
    }, INTERVALO_POLLING_MS)
  }, [detenerIntervalo, ejecutarFetch])

  useEffect(() => {
    desmontadoRef.current = false

    const alCambiarVisibilidad = (): void => {
      if (document.hidden) {
        detenerIntervalo()
      } else {
        void ejecutarFetch()
        iniciarIntervalo()
      }
    }

    const alEnfocar = (): void => {
      void ejecutarFetch()
    }

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
