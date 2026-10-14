// Etiquetas legibles de los niveles del veredicto. Módulo sin 'use client':
// lo comparten el chip del modal (cliente) y el PDF (servidor).
const ETIQUETAS_NIVEL: Record<string, string> = {
  sin_dato: 'Sin dato',
  sin_senal: 'Sin señal',
  vigilancia: 'Vigilancia',
  alerta: 'Alerta',
  severo: 'Severo',
}

export function etiquetaNivel(nivel: string): string {
  return ETIQUETAS_NIVEL[nivel] ?? nivel
}
