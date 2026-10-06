'use client'

import { useEffect, useState } from 'react'
import type { AlertaRadar } from './alertas-agrupadas'
import type { calcularResumen } from './resumen'
import type { agregarEnsembleDiario } from './ensemble'

export type DiaResumen = ReturnType<typeof calcularResumen>['departamentos'][number]['dias'][number] & {
  ensamble: ReturnType<typeof agregarEnsembleDiario>[string][string] | null
}
export type HoraResumen = ReturnType<typeof calcularResumen>['departamentos'][number]['proximas48h'][number]

export interface ResumenRadarMeteo {
  runId: string | null
  runAt: string | null
  sinDatos: boolean
  frescura: { edadMinutos: number; desactualizado: boolean } | null
  dias: string[]
  departamentos: Array<{ id: string; nombre: string; dias: DiaResumen[]; proximas48h: HoraResumen[] }>
  alertasSmn: AlertaRadar[]
}

const cacheKey = 'radar-meteo-resumen-v1'

export function useResumenRadarMeteo(activo: boolean): { resumen: ResumenRadarMeteo | null; error: boolean } {
  const [resumen, setResumen] = useState<ResumenRadarMeteo | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!activo) return
    let cancelado = false
    const etag = sessionStorage.getItem(`${cacheKey}-etag`)
    fetch('/api/infraestructura/radar-meteo/resumen', {
      headers: etag ? { 'If-None-Match': etag } : undefined,
    }).then(async (response) => {
      if (response.status === 304) return null
      if (!response.ok) throw new Error('No se pudo cargar el resumen')
      const respuesta = await response.json() as ResumenRadarMeteo
      const nuevoEtag = response.headers.get('ETag')
      if (nuevoEtag) sessionStorage.setItem(`${cacheKey}-etag`, nuevoEtag)
      sessionStorage.setItem(`${cacheKey}-data`, JSON.stringify(respuesta))
      return respuesta
    }).then((respuesta) => {
      if (cancelado) return
      const guardado = respuesta ?? JSON.parse(sessionStorage.getItem(`${cacheKey}-data`) ?? 'null') as ResumenRadarMeteo | null
      setResumen(guardado)
      setError(!guardado)
    }).catch(() => { if (!cancelado) setError(true) })
    return () => { cancelado = true }
  }, [activo])

  return { resumen, error }
}
