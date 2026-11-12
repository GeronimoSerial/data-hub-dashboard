'use client'

import type { JSX } from 'react'
import { TriangleAlert } from 'lucide-react'
import { resumirAlertas } from '@/lib/infraestructura/radar-meteo/alertas-agrupadas'
import type { GrupoAlertaRadar } from '@/lib/infraestructura/radar-meteo/alertas-agrupadas'
import { useTextos } from '@/lib/i18n/idioma-provider'

export function AlertasPastilla({ grupos, onVer }: {
  grupos: GrupoAlertaRadar[]
  onVer: () => void
}): JSX.Element | null {
  const t = useTextos()
  if (!grupos.length) return null

  const resumen = resumirAlertas(grupos, t)
  const claseNivel = resumen.nivel ? ` nivel-${resumen.nivel}` : ''

  return (
    <button
      type="button"
      className={`radar-alertas-pastilla${claseNivel}`}
      aria-label={t.radar.alertas.pastillaAria(resumen.texto)}
      onClick={onVer}
    >
      <TriangleAlert aria-hidden="true" size={16} />
      <span>{resumen.texto}</span>
    </button>
  )
}
