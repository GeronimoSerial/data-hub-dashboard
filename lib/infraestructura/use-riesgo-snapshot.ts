'use client'

import { useFetchVigente } from './use-fetch-vigente'

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
  // With no selected school the hook still runs, but the shared hook masks
  // retained data instead of resetting state from the effect body.
  return useFetchVigente<RespuestaRiesgoSnapshot>({
    activo: true,
    clave: snapshotId,
    mensajeError: MENSAJE_ERROR,
    limpiarAlCargar: true,
    limpiarAlFallar: true,
    ejecutar: async (signal) => {
      if (snapshotId === null) throw new Error('Snapshot requerido')
      // Clear the previous school's factors before loading the new snapshot.
      const respuesta = await fetch(rutaSnapshot(snapshotId), {
        signal,
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      })
      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`)
      return (await respuesta.json()) as RespuestaRiesgoSnapshot
    },
  })
}
