'use client'

import { mergeClasses } from '@fluentui/react-components'
import { COPY, semaforoGlosa } from '@/lib/copy/didactica'
import { SEMAFORO_ORDER, type SobreofertaData } from '@/lib/sobreoferta'
import { TREND_COLORS, type Summary, type Trend } from '@/lib/map-types'
import { useOverlayStyles } from '@/components/mapas/overlay-styles'

type Props = {
  summary: Summary
  sobreofertaOn?: boolean
  sobreoferta?: SobreofertaData | null
}

const ORDER: Trend[] = ['up', 'down', 'flat', 'partial']

export function LegendPanel({
  summary,
  sobreofertaOn = false,
  sobreoferta = null,
}: Props) {
  const styles = useOverlayStyles()
  const pct =
    summary.pctChange == null
      ? '—'
      : `${summary.pctChange > 0 ? '+' : ''}${summary.pctChange}%`

  return (
    <div className={mergeClasses(styles.panel, styles.legendPanel)}>
      <b>{COPY.legend.evolutionTitle}</b>
      <div className={styles.hint}>{COPY.legend.evolutionHint}</div>
      {COPY.legend.comparableLabel}: <b>{summary.comparableEstablishments}</b>
      <br />
      {COPY.legend.enrollment2023}: <b>{summary.enrollment2023}</b>
      <br />
      {COPY.legend.enrollment2026}: <b>{summary.enrollment2026}</b>
      <br />
      {COPY.legend.variation}: <b>{pct}</b>
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

      {sobreofertaOn && sobreoferta && (
        <>
          <br />
          <b>{COPY.legend.sobreofertaTitle}</b>
          <div className={styles.hint}>{COPY.legend.sobreofertaPurpose}</div>
          {SEMAFORO_ORDER.map((key) => {
            const c = sobreoferta.meta.colors[key]
            return (
              <div key={key} className={styles.legendItemStack}>
                <div className={styles.legendItem}>
                  <span
                    className={styles.swatch}
                    style={{
                      background: c.fill,
                      border: `2px solid ${c.stroke}`,
                    }}
                  />
                  {c.label}
                </div>
                <div className={styles.hint}>{semaforoGlosa(key)}</div>
              </div>
            )
          })}
          <br />
          {COPY.legend.tips.map((tip) => (
            <div key={tip} className={styles.hint}>
              {tip}
            </div>
          ))}
        </>
      )}

      {sobreofertaOn && !sobreoferta && (
        <>
          <br />
          <span className={styles.hint}>{COPY.legend.noSobreofertaData}</span>
        </>
      )}
    </div>
  )
}
