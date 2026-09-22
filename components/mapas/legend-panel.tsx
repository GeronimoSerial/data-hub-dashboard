'use client'

import { COPY, semaforoGlosa } from '@/lib/copy/didactica'
import { SEMAFORO_ORDER, type SobreofertaData } from '@/lib/sobreoferta'
import { TREND_COLORS, type Summary, type Trend } from '@/lib/map-types'
import { useOverlayStyles } from '@/components/mapas/overlay-styles'
import { SEVERIDADES } from '@/lib/infraestructura/validacion'
import { colorSeveridad } from '@/lib/infraestructura/severidad'
import type { IndicadoresMapa } from '@/lib/infraestructura/parte-mapa'

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
// Dominio distinto del resto de este archivo (evolución de matrícula) y,
// desde Fase 2, distinto también de la leyenda anterior: una escuela = un
// punto, y los tres canales visuales son color (severidad), tamaño (alumnos
// alcanzados) y anillo (servicio) — ver map-infraestructura-page.tsx para la
// codificación exacta. El símbolo por categoría desapareció (la categoría
// pasó a filtro y a la ficha), así que esta leyenda ya no lo explica.
//
// `indicadores` llega por props (igual que LegendPanel recibe `summary`
// arriba): son los mismos números que ya carga useAlertas para el panel de
// Indicadores, no una fuente de datos aparte.
export function InfraLegendPanel({ indicadores }: { indicadores: IndicadoresMapa }) {
  const styles = useOverlayStyles()

  return (
    <div className={`${styles.panel} ${styles.legendPanel}`}>
      <b>Referencias</b>
      <div className={styles.hint}>
        Color: severidad de la peor afectación vigente. Tamaño: alumnos alcanzados. Anillo:
        estado del servicio educativo.
      </div>

      {SEVERIDADES.map((severidad) => (
        <div key={severidad} className={styles.legendItem}>
          <span className={styles.swatch} style={{ background: colorSeveridad(severidad) }} />
          {severidad}
        </div>
      ))}

      <br />
      {/*
        El anillo no puede usar color (ya está tomado por severidad): se
        distingue por grosor y opacidad de trazo. Estos tres swatches son
        ilustrativos de esa codificación, no una escala de color nueva.
      */}
      <div className={styles.legendItem}>
        <span
          className={styles.swatch}
          style={{ background: 'transparent', border: '3px solid #1c1c1c', borderRadius: '50%' }}
        />
        Servicio suspendido (anillo grueso)
      </div>
      <div className={styles.legendItem}>
        <span
          className={styles.swatch}
          style={{
            background: 'transparent',
            border: '2px solid #1c1c1c',
            borderRadius: '50%',
            opacity: 0.55,
          }}
        />
        Servicio parcial (anillo fino)
      </div>
      <div className={styles.legendItem}>
        <span
          className={styles.swatch}
          style={{ background: 'transparent', border: '1px solid #1c1c1c', borderRadius: '50%' }}
        />
        Servicio normal (sin anillo)
      </div>

      <br />
      <div>
        Escuelas: <span className={styles.emphasis}>{indicadores.escuelas}</span>
      </div>
      <div>
        Con servicio suspendido:{' '}
        <span className={styles.emphasis}>{indicadores.conServicioSuspendido}</span>
      </div>
      <div>
        Con servicio parcial:{' '}
        <span className={styles.emphasis}>{indicadores.conServicioParcial}</span>
      </div>
      <div>
        Alumnos alcanzados:{' '}
        <span className={styles.emphasis}>{indicadores.alumnosAlcanzados}</span>
      </div>
    </div>
  )
}