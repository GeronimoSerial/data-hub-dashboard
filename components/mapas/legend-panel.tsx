'use client'

import { mergeClasses } from '@fluentui/react-components'
import { TREND_COLORS, type Summary, type Trend } from '@/lib/map-types'
import { useOverlayStyles } from '@/components/mapas/overlay-styles'

type Props = {
  summary: Summary
}

const ORDER: Trend[] = ['up', 'down', 'flat', 'partial']

export function LegendPanel({ summary }: Props) {
  const styles = useOverlayStyles()
  const pct =
    summary.pctChange == null
      ? '—'
      : `${summary.pctChange > 0 ? '+' : ''}${summary.pctChange}%`

  return (
    <div className={mergeClasses(styles.panel, styles.legendPanel)}>
      <b>Evolución matrícula 2023-2026</b>
      <br />
      Panel comparable: <b>{summary.comparableEstablishments} establecimientos</b>
      <br />
      Matrícula 2023: <b>{summary.enrollment2023}</b>
      <br />
      Matrícula 2026: <b>{summary.enrollment2026}</b>
      <br />
      Variación: <b>{pct}</b>
      <br />
      <br />
      {ORDER.map((trend) => {
        const c = TREND_COLORS[trend]
        return (
          <div key={trend} className={styles.legendItem}>
            <span
              className={styles.swatch}
              style={{ background: c.fill, border: `2px solid ${c.stroke}` }}
            />
            {c.label}
          </div>
        )
      })}
    </div>
  )
}
