'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

// Hook de lectura del "modo Radar" (E4). Copia deliberada del patrón de
// `use-alertas.ts`: querystring construido a mano, `AbortController` para
// cancelar el request anterior y comparación por `JSON.stringify` para no
// reemplazar la referencia cuando la respuesta no cambió.
//
// DIFERENCIA con use-alertas: el radar es un PRONÓSTICO, no un estado vivo de
// partes. No se hace polling cada 15 s (sería gastar requests para datos que
// cambian por corrida del motor, no por minuto): se consulta al activar el
// modo/horizonte/filtro y listo. El shape de retorno
// `{ data, loading, error }` se mantiene igual por consistencia.
//
// GATING: el componente NO puede llamar al hook condicionalmente (regla de
// hooks de React), así que el único modo correcto de "no llamarlo en modo
// Situación actual" es llamarlo siempre con `activo=false` y que el hook no
// dispare ningún request en ese caso. El efecto corta antes del fetch cuando
// `activo` es falso: ni request, ni loading, ni data.

const RUTA_RADAR = '/api/infraestructura/radar'
const MENSAJE_ERROR = 'No se pudo cargar el radar.'

export interface FiltrosRadar {
  horizonte?: number
  departamento?: string
  nivel?: string
  page?: number
  pageSize?: number
}

// El motor v0 sólo publica cortes para 24 | 72 | 240. `ahora` existe en el
// selector de UI pero no tiene evidencia en la API: nunca se manda como query.
export type HorizonteRadarApi = 24 | 72 | 240

export interface RadarCorte {
  runId: string
  publicadoEn: string
  modeloVersion: string
}

export interface RadarCobertura {
  procesadas: number
  conEvidencia: number
  sinEvidencia: number
}

export interface RadarDepartamento {
  departamento: string
  peorNivel: string
  horizonteHoras: number
  celdas: number
}

export interface RadarEscuela {
  snapshotId: string
  cueAnexo: string
  departamento: string
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

export interface RespuestaRadar {
  corte: RadarCorte | null
  cobertura: RadarCobertura | null
  departamentos: RadarDepartamento[]
  escuelas: {
    items: RadarEscuela[]
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
  kpis: {
    riesgoAltoTotal: number
    sinEvidenciaTotal: number
  }
}

function construirQueryString(filtros: FiltrosRadar): string {
  const parametros = new URLSearchParams()

  const agregar = (nombre: string, valor: string | number | undefined): void => {
    if (valor !== undefined && valor !== '') {
      parametros.set(nombre, String(valor))
    }
  }

  agregar('horizonte', filtros.horizonte)
  agregar('departamento', filtros.departamento)
  agregar('nivel', filtros.nivel)
  agregar('page', filtros.page)
  agregar('pageSize', filtros.pageSize)

  const cadena = parametros.toString()
  return cadena === '' ? '' : `?${cadena}`
}

export function useRadar(
  filtros: FiltrosRadar,
  activo: boolean,
): {
  data: RespuestaRadar | null
  loading: boolean
  error: string | null
} {
  const [data, setData] = useState<RespuestaRadar | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const desmontadoRef = useRef(false)
  const filtrosRef = useRef<FiltrosRadar>(filtros)

  // La clave serializa el contenido de los filtros: como `filtros` puede ser
  // un objeto nuevo en cada render, comparar por identidad dispararía el
  // efecto de más. Mismo criterio que la comparación de la respuesta.
  const claveFiltros = useMemo(() => JSON.stringify(filtros), [filtros])

  useEffect(() => {
    filtrosRef.current = filtros
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se sincroniza con claveFiltros, no con la identidad de `filtros`.
  }, [claveFiltros])

  // El fetch vive en su propio callback sin argumentos (lee `filtrosRef`), no
  // en el cuerpo del efecto: mismo patrón que `ejecutarFetch` de
  // use-alertas.ts, que evita el lint react-hooks/set-state-in-effect.
  const ejecutarFetch = useCallback(async (): Promise<void> => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    if (!desmontadoRef.current) {
      setLoading(true)
    }

    try {
      const respuesta = await fetch(`${RUTA_RADAR}${construirQueryString(filtrosRef.current)}`, {
        signal: controller.signal,
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      })

      if (!respuesta.ok) {
        throw new Error(`HTTP ${respuesta.status}`)
      }

      const json = (await respuesta.json()) as RespuestaRadar

      if (desmontadoRef.current || controller.signal.aborted) return

      setData((prev) => (prev && JSON.stringify(prev) === JSON.stringify(json) ? prev : json))
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

    if (!activo) {
      // Modo Situación actual (o flag apagado): ni request ni estado de
      // carga. No hace falta resetear data/loading/error acá: el valor
      // devuelto ya se enmascara más abajo cuando `activo` es falso.
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
  }, [activo, claveFiltros, ejecutarFetch])

  // Enmascarado en vez de resetear vía setState: en modo Situación actual (o
  // flag apagado) el consumidor nunca ve datos del radar, aunque el estado
  // interno conserve el último corte por si se reactiva.
  if (!activo) {
    return { data: null, loading: false, error: null }
  }
  return { data, loading, error }
}
