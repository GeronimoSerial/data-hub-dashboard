export interface ReporteLocalDisponible {
  draftId: string
  cue: string
  flujo: string
}

export function reportesDelRecorrido<T extends ReporteLocalDisponible>(reportes: T[], search: string): T[] {
  const parametros = new URLSearchParams(search)
  const cue = parametros.get('cue')
  if (!cue) return []
  const flujo = parametros.get('flujo')
  return reportes.filter((reporte) => reporte.cue === cue && (!flujo || reporte.flujo === flujo))
}

export function seleccionarReporteLocal(reportes: ReporteLocalDisponible[], search: string): string | null {
  const candidatos = reportesDelRecorrido(reportes, search)
  return candidatos.length === 1 ? candidatos[0].draftId : null
}
