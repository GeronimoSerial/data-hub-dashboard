'use client'

import type { JSX } from 'react'
import { TriangleAlert } from 'lucide-react'
import { resumirAlertas } from '@/lib/infraestructura/radar-meteo/alertas-agrupadas'
import type { GrupoAlertaRadar } from '@/lib/infraestructura/radar-meteo/alertas-agrupadas'

export function AlertasPastilla({ grupos, onVer }: {
  grupos: GrupoAlertaRadar[]
  onVer: () => void
}): JSX.Element | null {
  if (!grupos.length) return null

  const resumen = resumirAlertas(grupos)
  const claseNivel = resumen.nivel ? ` nivel-${resumen.nivel}` : ''

  return (
    <button
      type="button"
      className={`radar-alertas-pastilla${claseNivel}`}
      aria-label={`Ver alertas del SMN: ${resumen.texto}`}
      onClick={onVer}
    >
      <TriangleAlert aria-hidden="true" size={16} />
      <span>{resumen.texto}</span>
    </button>
  )
}
