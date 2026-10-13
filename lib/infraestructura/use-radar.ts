'use client'

import { useMemo } from 'react'
import { useFetchVigente } from './use-fetch-vigente'

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
  // Nivel de la amenaza sola (I-7), separado de la prioridad educativa
  // (`nivelRiesgo`). Opcional para no romper fixtures previos.
  nivelAmenaza?: string | null
  scoreVulnerabilidad: number | null
  confianza: string
  // Dimensión SEPARADA "riesgo de acceso" (ver motor/riesgo-acceso.ts): nunca
  // se mezcla con scoreRiesgo/scoreVulnerabilidad. `null` = riesgo de acceso
  // desconocido, no "bajo". Opcionales para no romper fixtures previos.
  scoreRiesgoAcceso?: number | null
  nivelRiesgoAcceso?: string | null
  confianzaAcceso?: string | null
  exposicionMatricula: number | null
  exposicionSecciones: number | null
  calculadoEn: string
  validoHasta: string
}

export interface RadarPunto {
  cueAnexo: string
  horizonteHoras: number
  nivelRiesgo: string | null
  // Ver RadarEscuela.nivelAmenaza. Opcional para no romper fixtures previos.
  nivelAmenaza?: string | null
  confianza: string
  nivelRiesgoAcceso: string | null
}

export interface RespuestaRadar {
  corte: RadarCorte | null
  cobertura: RadarCobertura | null
  departamentos: RadarDepartamento[]
  // Punto compacto por escuela para la cobertura del mapa: cubre TODO el
  // universo filtrado (el mismo que `escuelas.total`), no sólo la página del
  // ranking. `escuelas.items` sigue siendo la lista lateral paginada.
  puntos: RadarPunto[]
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
    // Matrícula potencialmente condicionada por acceso, ya deduplicada contra
    // la afectación confirmada (nunca se suma dos veces la misma matrícula).
    accesoCondicionado: { escuelas: number; matricula: number }
  }
  // P1: alguna celda del corte usa umbral provisorio (falta su climatología
  // ERA5). Opcional para no romper fixtures/mocks previos a este batch.
  hayNivelProvisorio?: boolean
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
  // The hook remains unconditional; `activo=false` cancels the request and
  // masks the retained result while the consumer is outside Radar mode.
  const claveFiltros = useMemo(() => JSON.stringify(filtros), [filtros])
  const resultado = useFetchVigente<RespuestaRadar>({
    activo,
    clave: claveFiltros,
    mensajeError: MENSAJE_ERROR,
    ejecutar: async (signal) => {
      const respuesta = await fetch(`${RUTA_RADAR}${construirQueryString(filtros)}`, {
        signal,
        cache: 'no-cache',
        headers: { Accept: 'application/json' },
      })
      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`)
      return (await respuesta.json()) as RespuestaRadar
    },
    conservarRespuesta: (anterior, nueva) => JSON.stringify(anterior) === JSON.stringify(nueva),
  })
  return resultado
}
