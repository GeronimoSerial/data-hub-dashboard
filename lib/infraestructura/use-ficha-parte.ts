'use client'

import { useEffect, useState } from 'react'
import type { DatosPadronEscuela } from './datos-padron-escuela'
import type {
  Categoria,
  AsistenciaPedagogica,
  EstadoEstablecimiento,
  EstadoServicioGeneral,
  JustificacionCritica,
  SeccionEstablecimiento,
  ServicioAlcance,
  Severidad,
} from './trayectoria-tipos'
import type { MovimientoHistorial } from '@/components/infraestructura/historial-movimiento'

// Forma de GET /api/mapas/infraestructura/parte. No incluye nombres de alumnos.
export interface AfectacionFicha {
  id: string
  motivo: string
  categoria: Categoria
  severidad: Severidad
  justificacionCritica?: JustificacionCritica
  justificacionCriticaDetalle?: string
  descripcion: string | null
  causadaPorId: string | null
  rigeDesde: string
  creadaEn: string
  totales: { secciones: number; alumnos: number }
  carreras?: string[]
}

export interface SolucionadaFicha {
  id: string
  motivo: string
  severidad: Severidad
  retiradaEn: string
}

export interface ParteFicha {
  id: string
  cueAnexo: string
  estadoEstablecimiento: EstadoEstablecimiento
  estadoEstablecimientoRigeDesde: string
  actualizadaEn: string
  asistenciaPedagogica?: AsistenciaPedagogica | null
}

export interface RespuestaParteMapa {
  ok: true
  periodo: { id: string; nombre: string } | null
  parte: ParteFicha | null
  servicio?: { estadoGeneral: EstadoServicioGeneral; alcanceVigente: ServicioAlcance[] }
  afectaciones?: AfectacionFicha[]
  secciones?: SeccionEstablecimiento[]
  datosPadron?: DatosPadronEscuela | null
  recientes?: SolucionadaFicha[]
  ultimaActualizacion?: string | null
}

export interface RespuestaHistorialMapa {
  ok?: boolean
  movimientos?: MovimientoHistorial[]
}

export type EstadoFicha =
  | { fase: 'cargando' }
  | { fase: 'listo'; datos: RespuestaParteMapa }
  | { fase: 'error' }

export type EstadoHistorial =
  | { fase: 'cargando' }
  | { fase: 'listo'; movimientos: MovimientoHistorial[] }
  | { fase: 'error' }

interface EstadoPorCue<T> {
  cueAnexo: string
  valor: T
}

/** Carga por separado la ficha del parte y su historial para el CUE indicado. */
export function useFichaParte(cueAnexo: string): {
  estado: EstadoFicha
  historial: EstadoHistorial
} {
  const [estadoPorCue, setEstadoPorCue] = useState<EstadoPorCue<EstadoFicha>>({
    cueAnexo,
    valor: { fase: 'cargando' },
  })
  const [historialPorCue, setHistorialPorCue] = useState<EstadoPorCue<EstadoHistorial>>({
    cueAnexo,
    valor: { fase: 'cargando' },
  })

  useEffect(() => {
    let vigente = true
    fetch(`/api/mapas/infraestructura/parte?cue=${encodeURIComponent(cueAnexo)}`)
      .then(async (respuesta) => {
        if (!respuesta.ok) throw new Error('fallo de acceso o de red')
        return (await respuesta.json()) as RespuestaParteMapa
      })
      .then((datos) => {
        if (vigente) setEstadoPorCue({ cueAnexo, valor: { fase: 'listo', datos } })
      })
      .catch(() => {
        if (vigente) setEstadoPorCue({ cueAnexo, valor: { fase: 'error' } })
      })
    return () => {
      vigente = false
    }
  }, [cueAnexo])

  useEffect(() => {
    let vigente = true
    fetch(`/api/mapas/infraestructura/historial?cue=${encodeURIComponent(cueAnexo)}`)
      .then(async (respuesta) => {
        if (!respuesta.ok) throw new Error('fallo de acceso o de red')
        return (await respuesta.json()) as RespuestaHistorialMapa
      })
      .then((datos) => {
        if (vigente) {
          setHistorialPorCue({
            cueAnexo,
            valor: { fase: 'listo', movimientos: datos.movimientos ?? [] },
          })
        }
      })
      .catch(() => {
        if (vigente) setHistorialPorCue({ cueAnexo, valor: { fase: 'error' } })
      })
    return () => {
      vigente = false
    }
  }, [cueAnexo])

  return {
    estado: estadoPorCue.cueAnexo === cueAnexo ? estadoPorCue.valor : { fase: 'cargando' },
    historial: historialPorCue.cueAnexo === cueAnexo
      ? historialPorCue.valor
      : { fase: 'cargando' },
  }
}
