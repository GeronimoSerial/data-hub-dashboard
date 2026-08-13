'use client'

import { mergeClasses } from '@fluentui/react-components'
import { COPY } from '@/lib/copy/didactica'
import type { Summary } from '@/lib/map-types'
import { useOverlayStyles } from '@/components/mapas/overlay-styles'

type Props = {
  summary: Summary
}

export function TitlePanel({ summary }: Props) {
  const styles = useOverlayStyles()

  return (
    <div className={mergeClasses(styles.panel, styles.titlePanel)}>
      <b>{summary.title}</b>
      <br />
      <span className={styles.hint}>{COPY.title.description}</span>
    </div>
  )
}
