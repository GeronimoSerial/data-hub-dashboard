'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ConsultaAlertasResultado, FiltrosAlertas } from './consulta'

const RUTA_ALERTAS = '/api/mapas/infraestructura'
const INTERVALO_POLLING_MS = 15000
const MENSAJE_ERROR = 'No se pudieron cargar las alertas.'

function construirQueryString(filtros: FiltrosAlertas): string {
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

  const cadena = parametros.toString()
  return cadena === '' ? '' : `?${cadena}`
}

export function useAlertas(filtros: FiltrosAlertas): {
  data: ConsultaAlertasResultado | null
  loading: boolean
  error: string | null
} {
  const [data, setData] = useState<ConsultaAlertasResultado | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const filtrosRef = useRef<FiltrosAlertas>(filtros)
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
        `${RUTA_ALERTAS}${construirQueryString(filtrosRef.current)}`,
        {
          signal: controller.signal,
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        },
      )

      if (!respuesta.ok) {
        throw new Error(`HTTP ${respuesta.status}`)
      }

      const json = (await respuesta.json()) as ConsultaAlertasResultado

      if (desmontadoRef.current || controller.signal.aborted) return

      setData(json)
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
  ])

  return { data, loading, error }
}
