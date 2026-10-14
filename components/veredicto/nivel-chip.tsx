'use client'

import type { JSX } from 'react'
import { etiquetaNivel } from '@/lib/infraestructura/veredicto/niveles'

export function NivelChip({ nivel }: { nivel: string }): JSX.Element {
  const etiqueta = etiquetaNivel(nivel)
  return (
    <span aria-label={`Nivel: ${etiqueta}`} className={`badge veredicto-nivel veredicto-nivel--${nivel}`}>
      {etiqueta}
    </span>
  )
}
