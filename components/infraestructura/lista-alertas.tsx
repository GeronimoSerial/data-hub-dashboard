'use client'

import type { JSX } from 'react'
import { useOverlayStyles } from '@/components/mapas/overlay-styles'
import type { ParteMapa } from '@/lib/infraestructura/parte-mapa'

export function ListaAlertas(props: {
  partes: ParteMapa[]
}): JSX.Element | null {
  const styles = useOverlayStyles()
  if (props.partes.length > 0) return null

  return (
    <div className={`${styles.panel} ${styles.legendPanel}`}>
      <span className={styles.hint}>
        No hay escuelas con afectación vigente.
      </span>
    </div>
  )
}
