'use client'

import { useEffect, useRef, useState } from 'react'

export type PreviaExportacion = {
  total: number
  totalAlumnos: number
  pagina: number
  tamanoPagina: number
  totalPaginas: number
  columnas: { clave: string; encabezado: string }[]
  filas: Record<string, unknown>[]
  opciones: {
    departamentos: { value: string; label: string }[]
    direcciones: { value: string; label: string }[]
  }
}

type Resultado = { solicitud: string; previa: PreviaExportacion | null; error: boolean }

export function usePrevia(url: string) {
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [reintento, setReintento] = useState(0)
  const recibioRespuesta = useRef(false)
  const solicitud = `${url}:${reintento}`

  useEffect(() => {
    const controlador = new AbortController()
    const temporizador = setTimeout(async () => {
      try {
        const respuesta = await fetch(url, {
          signal: controlador.signal, headers: { Accept: 'application/json' }, cache: 'no-cache',
        })
        if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`)
        const previa = await respuesta.json() as PreviaExportacion
        if (!controlador.signal.aborted) {
          recibioRespuesta.current = true
          setResultado({ solicitud, previa, error: false })
        }
      } catch {
        if (!controlador.signal.aborted) {
          setResultado(anterior => ({ solicitud, previa: anterior?.previa ?? null, error: true }))
        }
      }
    }, recibioRespuesta.current ? 250 : 0)
    return () => {
      clearTimeout(temporizador)
      controlador.abort()
    }
  }, [url, solicitud])

  return {
    previa: resultado?.previa ?? null,
    cargando: resultado?.solicitud !== solicitud,
    error: resultado?.solicitud === solicitud && resultado.error,
    reintentar: () => setReintento(n => n + 1),
  }
}
