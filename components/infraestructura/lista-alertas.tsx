'use client'

import type { JSX } from 'react'
import { useOverlayStyles } from '@/components/mapas/overlay-styles'
import type { ParteMapa } from '@/lib/infraestructura/parte-mapa'

export function ListaAlertas(props: {
  partes: ParteMapa[]
}): JSX.Element {
  const styles = useOverlayStyles()

  return (
    <div className={`${styles.panel} ${styles.legendPanel}`}>
      {props.partes.length === 0 ? (
        <span className={styles.hint}>
          No hay escuelas con afectación vigente.
        </span>
      ) : null}
    </div>
  )
}
