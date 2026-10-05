import { VENTANA_CAUSA_DIAS } from '@/lib/infraestructura/causa-afectacion'

export interface CandidataCausa {
  id: string
  motivo: string
  fecha: string
  activa: boolean
}

const MS_POR_DIA = 24 * 60 * 60 * 1000

function marcaDeTiempo(fecha: string): number {
  const timestamp = Date.parse(fecha)
  return Number.isFinite(timestamp) ? timestamp : 0
}

/** Deduplica las situaciones disponibles y conserva sólo las cerradas dentro de la ventana causal. */
export function armarCandidatasCausa(
  situaciones: readonly CandidataCausa[],
  ahora: Date = new Date(),
): CandidataCausa[] {
  const limiteCerradas = ahora.getTime() - VENTANA_CAUSA_DIAS * MS_POR_DIA
  const porId = new Map<string, CandidataCausa>()

  for (const situacion of situaciones) {
    if (!situacion.activa && marcaDeTiempo(situacion.fecha) < limiteCerradas) continue

    const existente = porId.get(situacion.id)
    if (
      !existente ||
      (situacion.activa && !existente.activa) ||
      (situacion.activa === existente.activa && marcaDeTiempo(situacion.fecha) > marcaDeTiempo(existente.fecha))
    ) {
      porId.set(situacion.id, situacion)
    }
  }

  return [...porId.values()].sort((a, b) => {
    if (a.activa !== b.activa) return a.activa ? -1 : 1
    return marcaDeTiempo(b.fecha) - marcaDeTiempo(a.fecha)
  })
}
