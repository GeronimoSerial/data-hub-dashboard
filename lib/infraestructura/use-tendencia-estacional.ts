'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// Hook de lectura de la capa opcional "Perspectiva 30-90 días" (Open-Meteo
// Seasonal, batch SEASONAL). Copia deliberada del patrón de use-radar.ts:
// AbortController para cancelar el request anterior, comparación por
// JSON.stringify para no reemplazar la referencia si la respuesta no cambió,
// y gating con `activo` (nunca condicional en el hook, regla de hooks) para
// que apagar el flag o salir de modo Radar no dispare ningún request.

const RUTA_TENDENCIA_ESTACIONAL = '/api/infraestructura/tendencia-estacional'
const MENSAJE_ERROR = 'No se pudo cargar la perspectiva estacional.'

export interface TendenciaEstacionalItem {
  departamento: string
  variable: string
  emisionEn: string
  validoDesde: string
  validoHasta: string
  horizonteDesdeDias: number
  horizonteHastaDias: number
  model: string
  miembrosTotal: number
  miembrosValidos: number
  mediaMm: number | null
  medianaMm: number | null
  dispersionMm: number | null
  probabilidadSobreNormal: number | null
}

export function useTendenciaEstacional(
  departamento: string | null,
  activo: boolean,
): {
  data: TendenciaEstacionalItem | null
  loading: boolean
  error: string | null
} {
  const [data, setData] = useState<TendenciaEstacionalItem | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const desmontadoRef = useRef(false)
  const departamentoRef = useRef<string | null>(departamento)

  useEffect(() => {
    departamentoRef.current = departamento
  }, [departamento])

  // El fetch vive en su propio callback sin argumentos (lee `departamentoRef`),
  // no en el cuerpo del efecto: mismo patrón que use-radar.ts, que evita el
  // lint react-hooks/set-state-in-effect por llamar setState sincrónicamente
  // en el cuerpo del efecto.
  const ejecutarFetch = useCallback(async (): Promise<void> => {
    const depto = departamentoRef.current
    if (depto === null) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    if (!desmontadoRef.current) setLoading(true)

    try {
      const query = new URLSearchParams({ departamento: depto }).toString()
      const respuesta = await fetch(`${RUTA_TENDENCIA_ESTACIONAL}?${query}`, {
        signal: controller.signal,
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      })
      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`)
      const json = (await respuesta.json()) as { items: TendenciaEstacionalItem[] }

      if (desmontadoRef.current || controller.signal.aborted) return
      const item = json.items[0] ?? null
      setData((prev) => (prev && JSON.stringify(prev) === JSON.stringify(item) ? prev : item))
      setError(null)
    } catch {
      if (controller.signal.aborted || desmontadoRef.current) return
      setError(MENSAJE_ERROR)
    } finally {
      if (abortRef.current === controller && !desmontadoRef.current) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    desmontadoRef.current = false

    if (!activo || departamento === null) {
      abortRef.current?.abort()
      abortRef.current = null
      return () => {
        desmontadoRef.current = true
      }
    }

    void ejecutarFetch()

    return () => {
      desmontadoRef.current = true
      abortRef.current?.abort()
    }
  }, [activo, departamento, ejecutarFetch])

  if (!activo || departamento === null) {
    return { data: null, loading: false, error: null }
  }
  return { data, loading, error }
}
