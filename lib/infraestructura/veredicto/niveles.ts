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

const CONECTORES = new Set(['de', 'del', 'la', 'las', 'los', 'y'])

// 'departamento:PASO DE LOS LIBRES' → 'Paso de los Libres'. Los ids de ámbito
// son el nombre normalizado del departamento, así que no hace falta catálogo.
export function nombreDepartamento(ambito: string): string {
  return ambito
    .replace(/^departamento[:_-]/i, '')
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((palabra, i) => {
      const minuscula = palabra.toLowerCase()
      if (i > 0 && CONECTORES.has(minuscula)) return minuscula
      return minuscula.charAt(0).toUpperCase() + minuscula.slice(1)
    })
    .join(' ')
}
