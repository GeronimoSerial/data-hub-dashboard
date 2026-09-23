'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { FiltrosMapa, IndicadoresMapa, ParteMapa } from './parte-mapa'

const RUTA_PARTES = '/api/mapas/infraestructura'
const INTERVALO_POLLING_MS = 15000
const MENSAJE_ERROR = 'No se pudieron cargar los partes.'

// Forma exacta de la respuesta de GET /api/mapas/infraestructura desde la
// migración a Fase 2: un parte por escuela, no una alerta por problemática.
export interface RespuestaPartesMapa {
  partes: ParteMapa[]
  indicadores: IndicadoresMapa
}

function construirQueryString(filtros: FiltrosMapa): string {
  const parametros = new URLSearchParams()

  const agregar = (nombre: string, valor: string | undefined): void => {
    if (valor !== undefined && valor !== '') {
      parametros.set(nombre, valor)
    }
  }

  agregar('territorio', filtros.territorio)
  agregar('nivel', filtros.nivel)
  agregar('establecimiento', filtros.cueAnexo)
  agregar('motivo', filtros.motivo)
  agregar('severidad', filtros.severidad)
  agregar('categoria', filtros.categoria)
  agregar('servicio', filtros.servicio)

  const cadena = parametros.toString()
  return cadena === '' ? '' : `?${cadena}`
}

export function useAlertas(filtros: FiltrosMapa): {
  data: RespuestaPartesMapa | null
  loading: boolean
  error: string | null
} {
  const [data, setData] = useState<RespuestaPartesMapa | null>(null)
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
        `${RUTA_PARTES}${construirQueryString(filtrosRef.current)}`,
        {
          signal: controller.signal,
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        },
      )

      if (!respuesta.ok) {
        throw new Error(`HTTP ${respuesta.status}`)
      }

      const json = (await respuesta.json()) as RespuestaPartesMapa

      if (desmontadoRef.current || controller.signal.aborted) return

      // El polling devuelve objetos nuevos aun cuando el parte no cambió.
      // Mantener la referencia evita reprocesar GeoJSON y clusters del mapa
      // cada 15 segundos sin un cambio real en los datos.
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
