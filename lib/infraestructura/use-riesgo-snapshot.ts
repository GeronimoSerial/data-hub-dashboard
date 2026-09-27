'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// Hook de lectura del detalle de un snapshot de riesgo (E3b), usado por el
// panel de explicación del modo Radar (E4, follow-up 4 del Gate) para mostrar
// los factores por escuela (tipo, fuente, valor, contribución, observado en)
// que `/api/infraestructura/radar` no expone. Mismo patrón que
// `use-radar.ts`/`use-alertas.ts`: `AbortController` para cancelar el
// request anterior, sin polling (es un snapshot ya calculado, no cambia
// mientras el corte siga vigente).
//
// GATING: se llama siempre (regla de hooks), con `snapshotId=null` cuando no
// hay escuela seleccionada en el radar. El efecto corta antes del fetch en
// ese caso: ni request, ni loading, ni data — igual que `useRadar` con
// `activo=false`.

const MENSAJE_ERROR = 'No se pudo cargar el detalle del riesgo.'

export interface FactorRiesgoSnapshot {
  tipo: string
  fuente: string
  variable: string
  valor: number | null
  unidad: string | null
  contribucion: number
  peso: number
  explicacion: string
  observadoEn: string | null
}

export interface SnapshotRiesgoDetalle {
  id: string
  runId: string
  cueAnexo: string
  horizonteHoras: number
  evidenciaValida: boolean
  scoreRiesgo: number | null
  nivelRiesgo: string | null
  scoreAmenaza: number | null
  scoreVulnerabilidad: number | null
  confianza: string
  exposicionMatricula: number | null
  exposicionSecciones: number | null
  calculadoEn: string
  validoHasta: string
}

export interface RespuestaRiesgoSnapshot {
  snapshot: SnapshotRiesgoDetalle
  factores: FactorRiesgoSnapshot[]
}

function rutaSnapshot(snapshotId: string): string {
  return `/api/infraestructura/riesgo/${encodeURIComponent(snapshotId)}`
}

export function useRiesgoSnapshot(snapshotId: string | null): {
  data: RespuestaRiesgoSnapshot | null
  loading: boolean
  error: string | null
} {
  const [data, setData] = useState<RespuestaRiesgoSnapshot | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const desmontadoRef = useRef(false)
  const snapshotIdRef = useRef<string | null>(snapshotId)

  useEffect(() => {
    snapshotIdRef.current = snapshotId
  }, [snapshotId])

  // Fetch en su propio callback (lee `snapshotIdRef`), no en el cuerpo del
  // efecto: mismo motivo que en `useRadar` (evita el lint
  // react-hooks/set-state-in-effect).
  const ejecutarFetch = useCallback(async (): Promise<void> => {
    const id = snapshotIdRef.current
    if (id === null) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    if (!desmontadoRef.current) {
      // Limpia el snapshot anterior antes de pedir el nuevo: si no,
      // mientras la escuela B carga se seguirían mostrando los factores de
      // la escuela A recién deseleccionada.
      setData(null)
      setError(null)
      setLoading(true)
    }

    try {
      const respuesta = await fetch(rutaSnapshot(id), {
        signal: controller.signal,
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      })

      if (!respuesta.ok) {
        throw new Error(`HTTP ${respuesta.status}`)
      }

      const json = (await respuesta.json()) as RespuestaRiesgoSnapshot

      if (desmontadoRef.current || controller.signal.aborted) return

      setData(json)
      setError(null)
    } catch {
      if (controller.signal.aborted || desmontadoRef.current) return
      setData(null)
      setError(MENSAJE_ERROR)
    } finally {
      if (abortRef.current === controller && !desmontadoRef.current) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    desmontadoRef.current = false

    if (snapshotId === null) {
      // Ninguna escuela seleccionada: ni request ni estado de carga. No se
      // llama a ningún setState acá (mismo motivo que `useRadar`): el valor
      // devuelto se enmascara más abajo en vez de resetear estado desde el
      // cuerpo del efecto.
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
  }, [snapshotId, ejecutarFetch])

  // Enmascarado en vez de resetear vía setState (ver comentario arriba): sin
  // escuela seleccionada, el consumidor nunca ve el snapshot de la escuela
  // anterior, aunque el estado interno lo conserve por si se reselecciona.
  if (snapshotId === null) {
    return { data: null, loading: false, error: null }
  }
  return { data, loading, error }
}
