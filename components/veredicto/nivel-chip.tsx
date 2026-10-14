'use client'

import type { JSX } from 'react'

const NIVELES: Record<string, { etiqueta: string; clases: string }> = {
  sin_dato: { etiqueta: 'Sin dato', clases: 'bg-gray-100 text-gray-700 border-gray-300' },
  sin_senal: { etiqueta: 'Sin señal', clases: 'bg-slate-100 text-slate-700 border-slate-300' },
  vigilancia: { etiqueta: 'Vigilancia', clases: 'bg-yellow-100 text-yellow-800 border-yellow-400' },
  alerta: { etiqueta: 'Alerta', clases: 'bg-orange-100 text-orange-800 border-orange-400' },
  severo: { etiqueta: 'Severo', clases: 'bg-red-100 text-red-800 border-red-400' },
}

export function etiquetaNivel(nivel: string): string {
  return NIVELES[nivel]?.etiqueta ?? nivel
}

export function NivelChip({ nivel }: { nivel: string }): JSX.Element {
  const config = NIVELES[nivel]
  const etiqueta = etiquetaNivel(nivel)
  return (
    <span
      aria-label={`Nivel: ${etiqueta}`}
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
        config?.clases ?? 'bg-gray-100 text-gray-700 border-gray-300'
      }`}
    >
      {etiqueta}
    </span>
  )
}
