'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

// Hook de lectura del "modo Replay" (batch E7c, UI sobre el motor de sólo
// lectura de E7b: GET /api/infraestructura/replay). Mismo patrón que
// `use-radar.ts`: querystring construido a mano, `AbortController` para
// cancelar el request anterior y comparación por `JSON.stringify` para no
// reemplazar la referencia cuando la respuesta no cambió.
//
// DIFERENCIA con el radar: el replay no es un pronóstico ni un estado vivo,
// es una consulta puntual sobre una ventana temporal ya cerrada. No hay
// polling (no tiene sentido "refrescar" historia) y el request sólo se
// dispara cuando cambian los filtros o `activo` pasa a true (el usuario abre
// el modo Replay y elige territorio/ventana/vista).
//
// GATING: igual que useRadar, el hook SIEMPRE se llama (regla de hooks) y es
// `activo` quien decide si dispara el fetch; con `activo=false` no hay
// request, loading ni data expuesta.

const RUTA_REPLAY = '/api/infraestructura/replay'
const MENSAJE_ERROR = 'No se pudo cargar el replay.'

export type VistaReplay = 'conocido' | 'reconstruido'

export interface FiltrosReplay {
  territorioId?: string
  desde?: string
  hasta?: string
  paso?: number
  vista: VistaReplay
  episodioDerivadoId?: string
}

// Espejo (sin importar zod) de los contratos de
// lib/infraestructura/replay/tipos.ts: este hook corre en el cliente y sólo
// necesita la FORMA de la respuesta, no la validación — esa ya la hizo el
// servidor.
export interface AfectacionConfirmadaReplay {
  cueAnexo: string
  motivo: string
  categoria: string
  severidad: string
  rigeDesde: string
}

export interface NivelRiesgoEscuelaReplay {
  cueAnexo: string
  nivelRiesgo: string | null
  horizonteHoras: number
}

export interface SnapshotRiesgoReplay {
  runId: string
  publicadoEn: string
  porEscuela: NivelRiesgoEscuelaReplay[]
}

export interface NivelPeligroReplay {
  geometryRef: string
  nivel: string
  emitidoEn: string
  metodo?: 'percentiles' | 'umbral_provisorio'
}

export interface LluviaObservadaReplay {
  geometryRef: string
  valorMm: number
  observadoEn: string
}

export interface SaludFuenteReplay {
  fuente: string
  estado: string
  actualizadoEn: string
}

export interface CuadroReplay {
  instante: string
  afectacionesConfirmadas: AfectacionConfirmadaReplay[]
  snapshotRiesgo: SnapshotRiesgoReplay | null
  nivelesPeligro: NivelPeligroReplay[]
  lluviaObservada: LluviaObservadaReplay[]
  saludFuentes: SaludFuenteReplay[]
}

export interface VaciosReplay {
  snapshotRiesgo: boolean
  peligro: boolean
  lluvia: boolean
}

export interface RespuestaReplay {
  cuadros: CuadroReplay[]
  vacios: VaciosReplay[]
  siguienteDesde: string | null
}

function construirQueryString(filtros: FiltrosReplay): string {
  const parametros = new URLSearchParams()
  parametros.set('territorioTipo', 'departamento')
  parametros.set('vista', filtros.vista)

  const agregar = (nombre: string, valor: string | number | undefined): void => {
    if (valor !== undefined && valor !== '') {
      parametros.set(nombre, String(valor))
    }
  }

  agregar('territorioId', filtros.territorioId)
  agregar('desde', filtros.desde)
  agregar('hasta', filtros.hasta)
  agregar('paso', filtros.paso)
  agregar('episodioDerivadoId', filtros.episodioDerivadoId)

  return `?${parametros.toString()}`
}

// El alcance está completo cuando hay episodio derivado, o territorio + toda
// la ventana. Sin esto, el hook dispararía un 400 previsible cada vez que el
// usuario recién eligió el departamento pero todavía no la fecha (o
// viceversa) — mejor no pedir nada hasta que el alcance sea válido.
function alcanceCompleto(filtros: FiltrosReplay): boolean {
  if (filtros.episodioDerivadoId !== undefined) return true
  return (
    filtros.territorioId !== undefined &&
    filtros.desde !== undefined &&
    filtros.hasta !== undefined
  )
}

export function useReplay(
  filtros: FiltrosReplay,
  activo: boolean,
): {
  data: RespuestaReplay | null
  loading: boolean
  error: string | null
} {
  const [data, setData] = useState<RespuestaReplay | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const desmontadoRef = useRef(false)
  const filtrosRef = useRef<FiltrosReplay>(filtros)

  const claveFiltros = useMemo(() => JSON.stringify(filtros), [filtros])
  const activoConAlcance = activo && alcanceCompleto(filtros)

  useEffect(() => {
    filtrosRef.current = filtros
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se sincroniza con claveFiltros, no con la identidad de `filtros`.
  }, [claveFiltros])

  const ejecutarFetch = useCallback(async (): Promise<void> => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    if (!desmontadoRef.current) {
      setLoading(true)
    }

    try {
      const respuesta = await fetch(
        `${RUTA_REPLAY}${construirQueryString(filtrosRef.current)}`,
        {
          signal: controller.signal,
          cache: 'no-cache',
          headers: { Accept: 'application/json' },
        },
      )

      if (!respuesta.ok) {
        throw new Error(`HTTP ${respuesta.status}`)
      }

      const json = (await respuesta.json()) as RespuestaReplay

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

    if (!activoConAlcance) {
      // Modo apagado, flag apagado o alcance incompleto todavía: ni request
      // ni estado de carga.
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
  }, [activoConAlcance, claveFiltros, ejecutarFetch])

  // Enmascarado en vez de resetear vía setState: fuera del modo Replay (o con
  // el alcance incompleto) el consumidor nunca ve datos, aunque el estado
  // interno conserve el último resultado por si se reactiva.
  if (!activoConAlcance) {
    return { data: null, loading: false, error: null }
  }
  return { data, loading, error }
}
