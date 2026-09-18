'use client'

import { COPY, semaforoGlosa } from '@/lib/copy/didactica'
import { SEMAFORO_ORDER, type SobreofertaData } from '@/lib/sobreoferta'
import { TREND_COLORS, type Summary, type Trend } from '@/lib/map-types'
import { useOverlayStyles } from '@/components/mapas/overlay-styles'
import { SEVERIDADES } from '@/lib/infraestructura/validacion'
import { colorSeveridad } from '@/lib/infraestructura/severidad'

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
    <div className={`${styles.panel} ${styles.legendPanel}`}>
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

// ── Leyenda del mapa de infraestructura ─────────────────────────────────────
//
// Dominio distinto del resto de este archivo (evolución de matrícula): el
// símbolo codifica la categoría (● relleno = establecimiento, ○ anillo =
// alumnos) y el color codifica la severidad, no la tendencia. Componente
// propio en vez de reutilizar LegendPanel de arriba, que está armado
// enteramente alrededor de Summary/Trend.
export function InfraLegendPanel() {
  const styles = useOverlayStyles()

  return (
    <div className={`${styles.panel} ${styles.legendPanel}`}>
      <b>Referencias</b>
      <div className={styles.hint}>
        El símbolo indica la categoría de la problemática; el color, su severidad.
      </div>
      <div className={styles.legendItem}>
        <span className={styles.swatch} style={{ background: '#777', borderRadius: '50%' }} />
        Afecta al establecimiento
      </div>
      <div className={styles.legendItem}>
        <span
          className={styles.swatch}
          style={{ background: 'transparent', border: '2px solid #777', borderRadius: '50%' }}
        />
        Inaccesibilidad de alumnos
      </div>
      <br />
      {SEVERIDADES.map((severidad) => (
        <div key={severidad} className={styles.legendItem}>
          <span className={styles.swatch} style={{ background: colorSeveridad(severidad) }} />
          {severidad}
        </div>
      ))}
    </div>
  )
}