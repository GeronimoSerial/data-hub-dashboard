'use client'

import { useEffect, useRef, useState } from 'react'
import type { TerritorioMapa } from './territorio-mapa'

const RUTA_TERRITORIO = '/api/mapas/infraestructura/territorio'
const MENSAJE_ERROR = 'No se pudieron cargar los datos de acceso y agua. Probá de nuevo en unos minutos.'

interface ResultadoTerritorio {
  data: TerritorioMapa | null
  error: string | null
}

// Carga las capas territoriales estáticas (aislamiento OSM + susceptibilidad
// physrisk) UNA sola vez, cuando `habilitado` pasa a true. A diferencia de los
// hooks de partes, no hay polling: el dato es de largo plazo, no operativo.
// Mientras `habilitado` es false no se dispara ninguna request (el valor de
// retorno se deriva en render, nunca se resetea estado desde el efecto).
export function useTerritorioMapa(habilitado: boolean): {
  data: TerritorioMapa | null
  loading: boolean
  error: string | null
} {
  const [resultado, setResultado] = useState<ResultadoTerritorio | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const desmontadoRef = useRef(false)
  const pedidoRef = useRef(false)

  useEffect(() => {
    desmontadoRef.current = false

    if (!habilitado) {
      abortRef.current?.abort()
      abortRef.current = null
      return () => {
        desmontadoRef.current = true
      }
    }

    if (pedidoRef.current || resultado !== null) {
      return () => {
        desmontadoRef.current = true
        abortRef.current?.abort()
      }
    }

    pedidoRef.current = true
    const controller = new AbortController()
    abortRef.current = controller
    let resuelto = false

    void (async () => {
      try {
        const respuesta = await fetch(RUTA_TERRITORIO, {
          signal: controller.signal,
          cache: 'no-cache',
          headers: { Accept: 'application/json' },
        })

        if (!respuesta.ok) {
          throw new Error(`HTTP ${respuesta.status}`)
        }

        const json = (await respuesta.json()) as TerritorioMapa
        if (controller.signal.aborted || desmontadoRef.current) return

        setResultado({ data: json, error: null })
      } catch {
        if (controller.signal.aborted || desmontadoRef.current) return
        setResultado({ data: null, error: MENSAJE_ERROR })
      } finally {
        resuelto = true
      }
    })()

    return () => {
      desmontadoRef.current = true
      abortRef.current?.abort()
      // StrictMode double-invoca los efectos: el cleanup aborta el pedido en
      // vuelo, pero si `pedidoRef` quedara en true el re-run nunca volvería a
      // fetch (data null / loading true en dev). Si el pedido todavía no
      // resolvió, se libera la marca para permitir el siguiente intento.
      if (!resuelto) {
        pedidoRef.current = false
        abortRef.current = null
      }
    }
  }, [habilitado, resultado])

  // Derivación en render: sin capas habilitadas el consumidor nunca ve una
  // carga en curso ni datos viejos. Con el pedido en vuelo `resultado` es null.
  if (!habilitado) {
    return { data: null, loading: false, error: null }
  }
  return {
    data: resultado?.data ?? null,
    error: resultado?.error ?? null,
    loading: resultado === null,
  }
}
