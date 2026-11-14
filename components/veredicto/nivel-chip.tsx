'use client'

import type { JSX } from 'react'
import { useTextos } from '@/lib/i18n/idioma-provider'

export function NivelChip({ nivel }: { nivel: string }): JSX.Element {
  const tv = useTextos().residuos.veredicto
  const etiqueta = (tv.niveles as Record<string, string>)[nivel] ?? nivel
  return (
    <span aria-label={tv.ariaNivel(etiqueta)} className={`badge veredicto-nivel veredicto-nivel--${nivel}`}>
      {etiqueta}
    </span>
  )
}
