'use client'

import { useCallback, useEffect, useState } from 'react'
import type { DatasetV29 } from '@/lib/reorganizacion/tipos'

export const URL_DATOS_REORGANIZACION = '/api/mapas/reorganizacion/datos'

export const MENSAJE_SIN_PERMISO = 'No tiene acceso a este mapa'
export const MENSAJE_ERROR_DATOS = 'No se pudieron cargar los datos del mapa.'

export type EstadoDatasetReorganizacion = 'cargando' | 'listo' | 'error' | 'sin_permiso'

export interface ResultadoDatasetReorganizacion {
  estado: EstadoDatasetReorganizacion
  dataset?: DatasetV29
  mensaje?: string
  reintentar: () => void
}

class SinPermisoError extends Error {}

async function traerDatos(signal: AbortSignal): Promise<DatasetV29> {
  const respuesta = await fetch(URL_DATOS_REORGANIZACION, { signal, cache: 'no-store' })
  if (respuesta.status === 401 || respuesta.status === 403) throw new SinPermisoError()
  if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`)
  return (await respuesta.json()) as DatasetV29
}

// Caché de módulo: el corte V29 pesa lo suficiente como para no repetir la
// descarga al montar otra vez el mapa. Sólo se guarda un resultado exitoso;
// un error o un 401/403 no queda cacheado y el siguiente montaje reintenta.
let datosCacheados: DatasetV29 | null = null
// Una sola descarga en vuelo compartida por todos los suscriptores. Se aborta
// sólo cuando se desuscribe el último, así un StrictMode (montar, desmontar,
// montar) no deja al segundo montaje con un abort ajeno.
let vuelo: { controlador: AbortController; promesa: Promise<DatasetV29>; suscriptores: number } | null = null

function suscribirse(): { promesa: Promise<DatasetV29>; liberar: () => void } {
  if (datosCacheados) return { promesa: Promise.resolve(datosCacheados), liberar: () => undefined }
  if (!vuelo) {
    const controlador = new AbortController()
    const actual = { controlador, promesa: traerDatos(controlador.signal), suscriptores: 0 }
    vuelo = actual
    actual.promesa.then(
      (datos) => {
        datosCacheados = datos
        if (vuelo === actual) vuelo = null
      },
      () => {
        if (vuelo === actual) vuelo = null
      },
    )
  }
  const actual = vuelo
  actual.suscriptores += 1
  let liberado = false
  return {
    promesa: actual.promesa,
    liberar: () => {
      if (liberado) return
      liberado = true
      actual.suscriptores -= 1
      if (actual.suscriptores === 0 && vuelo === actual) {
        vuelo = null
        actual.controlador.abort()
      }
    },
  }
}

function esAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

/** Sólo para pruebas: vacía la caché de módulo entre casos. */
export function reiniciarCacheDatosReorganizacion(): void {
  datosCacheados = null
  vuelo = null
}

export function useDatasetReorganizacion(): ResultadoDatasetReorganizacion {
  const [estado, setEstado] = useState<
    Pick<ResultadoDatasetReorganizacion, 'estado' | 'dataset' | 'mensaje'>
  >(() =>
    datosCacheados
      ? { estado: 'listo', dataset: datosCacheados }
      : { estado: 'cargando' },
  )
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    if (datosCacheados) return
    let activo = true
    const { promesa, liberar } = suscribirse()
    promesa.then(
      (dataset) => {
        if (activo) setEstado({ estado: 'listo', dataset })
      },
      (error: unknown) => {
        if (!activo || esAbort(error)) return
        if (error instanceof SinPermisoError) {
          setEstado({ estado: 'sin_permiso', mensaje: MENSAJE_SIN_PERMISO })
          return
        }
        setEstado({ estado: 'error', mensaje: MENSAJE_ERROR_DATOS })
      },
    )
    return () => {
      activo = false
      liberar()
    }
  }, [intento])

  const reintentar = useCallback(() => {
    setEstado({ estado: 'cargando' })
    setIntento((n) => n + 1)
  }, [])

  return { ...estado, reintentar }
}
