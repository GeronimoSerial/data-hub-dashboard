'use client'

import type { Summary } from '@/lib/map-types'
import { useOverlayStyles } from '@/components/mapas/overlay-styles'

type Props = {
  summary: Summary
}

export function TitlePanel({ summary }: Props) {
  const styles = useOverlayStyles()

  return (
    <div className={`${styles.panel} ${styles.titlePanel}`}>
      <b>{summary.title}</b>
      <br />
      {summary.description}
    </div>
  )
}
