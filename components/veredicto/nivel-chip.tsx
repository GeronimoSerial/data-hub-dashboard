'use client'

import type { JSX } from 'react'
import { etiquetaNivel } from '@/lib/infraestructura/veredicto/niveles'

const CLASES_NIVEL: Record<string, string> = {
  sin_dato: 'bg-gray-100 text-gray-700 border-gray-300',
  sin_senal: 'bg-slate-100 text-slate-700 border-slate-300',
  vigilancia: 'bg-yellow-100 text-yellow-800 border-yellow-400',
  alerta: 'bg-orange-100 text-orange-800 border-orange-400',
  severo: 'bg-red-100 text-red-800 border-red-400',
}

export function NivelChip({ nivel }: { nivel: string }): JSX.Element {
  const etiqueta = etiquetaNivel(nivel)
  return (
    <span
      aria-label={`Nivel: ${etiqueta}`}
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
        CLASES_NIVEL[nivel] ?? 'bg-gray-100 text-gray-700 border-gray-300'
      }`}
    >
      {etiqueta}
    </span>
  )
}
