'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { LineString } from 'geojson'

export const URL_RUTA_RECORRIDO = '/api/mapas/reorganizacion/ruta'

export type EstadoRecorrido =
  | 'inactivo'
  | 'eligiendo_origen'
  | 'eligiendo_destino'
  | 'cargando'
  | 'listo'
  | 'error'

export type CodigoErrorRecorrido =
  | 'parametros_invalidos'
  | 'sin_acceso'
  | 'sin_ruta_vial'
  | 'limite_excedido'
  | 'proveedor_no_disponible'
  | 'tiempo_agotado'
  | 'red'
  | 'desconocido'

export interface PuntoRecorrido {
  cue: string
  nombre: string
  lat: number
  lon: number
}

export interface ResultadoRecorrido {
  distanciaKm: number
  duracionMin: number
  geometria: LineString
}

export interface ErrorRecorrido {
  codigo: CodigoErrorRecorrido
  mensaje: string
}

const MENSAJES: Record<CodigoErrorRecorrido, string> = {
  parametros_invalidos: 'Las coordenadas del punto no son válidas para calcular un recorrido.',
  sin_acceso: 'No tiene acceso para medir recorridos.',
  sin_ruta_vial: 'No hay un camino vial conectado entre ambos puntos.',
  limite_excedido: 'Se realizaron demasiadas consultas de recorrido. Intente nuevamente más tarde.',
  proveedor_no_disponible: 'El servicio de recorridos no está disponible en este momento.',
  tiempo_agotado: 'El servicio de recorridos tardó demasiado en responder.',
  red: 'No se pudo conectar con el servicio de recorridos.',
  desconocido: 'No se pudo calcular el recorrido.',
}

class FallaRecorrido extends Error {
  readonly codigo: CodigoErrorRecorrido

  constructor(codigo: CodigoErrorRecorrido) {
    super(codigo)
    this.codigo = codigo
  }
}

// Traduce el estado HTTP del proxy. Nunca se sustituye por una distancia lineal.
function codigoDeEstado(status: number): CodigoErrorRecorrido {
  if (status === 400) return 'parametros_invalidos'
  if (status === 401 || status === 403) return 'sin_acceso'
  if (status === 404) return 'sin_ruta_vial'
  if (status === 429) return 'limite_excedido'
  if (status === 502) return 'proveedor_no_disponible'
  if (status === 504) return 'tiempo_agotado'
  return 'desconocido'
}

function esResultadoValido(cuerpo: unknown): cuerpo is ResultadoRecorrido {
  if (!cuerpo || typeof cuerpo !== 'object') return false
  const { distanciaKm, duracionMin, geometria } = cuerpo as Record<string, unknown>
  return (
    typeof distanciaKm === 'number' &&
    typeof duracionMin === 'number' &&
    !!geometria &&
    typeof geometria === 'object' &&
    (geometria as { type?: unknown }).type === 'LineString'
  )
}

async function pedirRuta(origen: PuntoRecorrido, destino: PuntoRecorrido, senal: AbortSignal) {
  const query = new URLSearchParams({
    origen: `${origen.lat},${origen.lon}`,
    destino: `${destino.lat},${destino.lon}`,
  })
  let respuesta: Response
  try {
    respuesta = await fetch(`${URL_RUTA_RECORRIDO}?${query}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: senal,
    })
  } catch {
    throw new FallaRecorrido('red')
  }
  if (!respuesta.ok) throw new FallaRecorrido(codigoDeEstado(respuesta.status))
  const cuerpo: unknown = await respuesta.json().catch(() => null)
  if (!esResultadoValido(cuerpo)) throw new FallaRecorrido('desconocido')
  return cuerpo
}

function errorDeFalla(falla: unknown): ErrorRecorrido {
  const codigo = falla instanceof FallaRecorrido ? falla.codigo : 'desconocido'
  return { codigo, mensaje: MENSAJES[codigo] }
}

interface Medicion {
  estado: EstadoRecorrido
  origen: PuntoRecorrido | null
  destino: PuntoRecorrido | null
  resultado: ResultadoRecorrido | null
  error: ErrorRecorrido | null
}

const MEDICION_INICIAL: Medicion = {
  estado: 'inactivo',
  origen: null,
  destino: null,
  resultado: null,
  error: null,
}

/**
 * Medición de recorridos viales entre dos establecimientos. Una consulta en
 * curso se cancela al empezar otra, al limpiar, al desactivar y al desmontar.
 */
export function useRecorrido() {
  const [medicion, setMedicion] = useState<Medicion>(MEDICION_INICIAL)
  // Las referencias permiten llamadas seguidas dentro del mismo ciclo de render.
  const medicionRef = useRef<Medicion>(MEDICION_INICIAL)
  const controladorRef = useRef<AbortController | null>(null)

  const actualizar = useCallback((cambios: Partial<Medicion>) => {
    medicionRef.current = { ...medicionRef.current, ...cambios }
    setMedicion(medicionRef.current)
  }, [])

  const cancelar = useCallback(() => {
    controladorRef.current?.abort()
    controladorRef.current = null
  }, [])

  const consultar = useCallback(
    (origen: PuntoRecorrido, destino: PuntoRecorrido) => {
      cancelar()
      const controlador = new AbortController()
      controladorRef.current = controlador
      actualizar({ estado: 'cargando', origen, destino, resultado: null, error: null })
      pedirRuta(origen, destino, controlador.signal).then(
        (resultado) => {
          // Una respuesta obsoleta no debe pisar la medición vigente.
          if (controlador.signal.aborted) return
          controladorRef.current = null
          actualizar({ estado: 'listo', resultado })
        },
        (falla: unknown) => {
          if (controlador.signal.aborted) return
          controladorRef.current = null
          actualizar({ estado: 'error', error: errorDeFalla(falla) })
        },
      )
    },
    [actualizar, cancelar],
  )

  const activar = useCallback(() => {
    cancelar()
    actualizar({ ...MEDICION_INICIAL, estado: 'eligiendo_origen' })
  }, [actualizar, cancelar])

  const desactivar = useCallback(() => {
    cancelar()
    actualizar(MEDICION_INICIAL)
  }, [actualizar, cancelar])

  const fijarOrigen = useCallback(
    (punto: PuntoRecorrido) => {
      const { destino } = medicionRef.current
      if (destino) {
        consultar(punto, destino)
        return
      }
      cancelar()
      actualizar({ estado: 'eligiendo_destino', origen: punto, destino: null, resultado: null, error: null })
    },
    [actualizar, cancelar, consultar],
  )

  const fijarDestino = useCallback(
    (punto: PuntoRecorrido) => {
      const { origen } = medicionRef.current
      if (origen) {
        consultar(origen, punto)
        return
      }
      cancelar()
      actualizar({ estado: 'eligiendo_origen', origen: null, destino: punto, resultado: null, error: null })
    },
    [actualizar, cancelar, consultar],
  )

  const elegirPunto = useCallback(
    (punto: PuntoRecorrido) => {
      const { estado } = medicionRef.current
      if (estado === 'inactivo') return
      if (estado === 'eligiendo_destino') {
        fijarDestino(punto)
        return
      }
      if (estado === 'eligiendo_origen') {
        fijarOrigen(punto)
        return
      }
      // Desde un resultado o un error, el punto elegido inicia otra medición.
      cancelar()
      actualizar({ estado: 'eligiendo_destino', origen: punto, destino: null, resultado: null, error: null })
    },
    [actualizar, cancelar, fijarDestino, fijarOrigen],
  )

  const limpiar = useCallback(() => {
    cancelar()
    actualizar({
      estado: medicionRef.current.estado === 'inactivo' ? 'inactivo' : 'eligiendo_origen',
      origen: null,
      destino: null,
      resultado: null,
      error: null,
    })
  }, [actualizar, cancelar])

  useEffect(() => () => cancelar(), [cancelar])

  return {
    ...medicion,
    activar,
    desactivar,
    elegirPunto,
    fijarOrigen,
    fijarDestino,
    limpiar,
  }
}
