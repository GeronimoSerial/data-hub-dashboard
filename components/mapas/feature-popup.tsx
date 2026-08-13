'use client'

import type { SelectedFeature } from '@/lib/map-types'
import { useOverlayStyles } from '@/components/mapas/overlay-styles'

type Props = {
  feature: SelectedFeature
}

function money(n: number | null | undefined) {
  if (n == null) return '—'
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 2,
  }).format(n)
}

function pct(n: number | null | undefined) {
  if (n == null) return '—'
  return `${n.toFixed(1)}%`
}

export function FeaturePopup({ feature }: Props) {
  const styles = useOverlayStyles()

  if (feature.kind === 'establishment') {
    const p = feature.properties
    return (
      <div className={styles.popup}>
        <h3 className={styles.popupTitle}>{p.name ?? 'Establecimiento'}</h3>
        <div className={styles.popupRow}>
          <b>CUE-Anexo:</b> {p.cue ?? '—'}
        </div>
        <div className={styles.popupRow}>
          <b>Localidad:</b> {p.locality ?? '—'}
        </div>
        <div className={styles.popupRow}>
          <b>Departamento:</b> {p.department ?? '—'}
        </div>
        <div className={styles.popupRow}>
          <b>Zona:</b> {p.zone ?? '—'}
        </div>
        <hr className={styles.popupRule} />
        <div className={styles.popupRow}>
          <b>2023:</b> {p.enrollment?.[2023] ?? '—'}
        </div>
        <div className={styles.popupRow}>
          <b>2024:</b> {p.enrollment?.[2024] ?? '—'}
        </div>
        <div className={styles.popupRow}>
          <b>2025:</b> {p.enrollment?.[2025] ?? '—'}
        </div>
        <div className={styles.popupRow}>
          <b>2026:</b> {p.enrollment?.[2026] ?? '—'}
        </div>
        <div className={styles.popupRow}>
          <b>Variación absoluta 2023-2026:</b> {p.absChange ?? '—'}
        </div>
        <div className={styles.popupRow}>
          <b>Variación porcentual 2023-2026:</b> {pct(p.pctChange)}
        </div>
        <div className={styles.popupRow}>
          <b>Tendencia:</b> {p.trendLabel ?? '—'}
        </div>
        <hr className={styles.popupRule} />
        <div className={styles.popupRow}>
          <b>Costo mensual de sueldos:</b> {money(p.monthlySalaryCost)}
        </div>
      </div>
    )
  }

  const p = feature.properties
  return (
    <div className={styles.popup}>
      <h3 className={styles.popupTitle}>{p.name}</h3>
      <div className={styles.popupRow}>
        <b>Diámetro:</b> {p.diameterKm ?? 20} km
      </div>
      <div className={styles.popupRow}>
        <b>Establecimientos:</b> {p.establishments ?? '—'}
      </div>
      <div className={styles.popupRow}>
        <b>Con historia completa:</b> {p.completeHistory ?? '—'}
      </div>
      <hr className={styles.popupRule} />
      <div className={styles.popupRow}>
        <b>Matrícula observable 2023:</b> {p.observable?.[2023] ?? '—'}
      </div>
      <div className={styles.popupRow}>
        <b>Matrícula observable 2024:</b> {p.observable?.[2024] ?? '—'}
      </div>
      <div className={styles.popupRow}>
        <b>Matrícula observable 2025:</b> {p.observable?.[2025] ?? '—'}
      </div>
      <div className={styles.popupRow}>
        <b>Matrícula observable 2026:</b> {p.observable?.[2026] ?? '—'}
      </div>
      <div className={styles.popupRow}>
        <b>Panel comparable 2023:</b> {p.comparable?.[2023] ?? '—'}
      </div>
      <div className={styles.popupRow}>
        <b>Panel comparable 2026:</b> {p.comparable?.[2026] ?? '—'}
      </div>
      <div className={styles.popupRow}>
        <b>Variación comparable 2023-2026:</b> {pct(p.pctChange)}
      </div>
      <div className={styles.popupRow}>
        <b>Tendencia:</b> {p.trendLabel ?? '—'}
      </div>
      <hr className={styles.popupRule} />
      <div className={styles.popupRow}>
        <b>Aumentaron:</b> {p.upCount ?? '—'} <b>Disminuyeron:</b>{' '}
        {p.downCount ?? '—'} <b>Sin cambio:</b> {p.flatCount ?? '—'}
      </div>
      <div className={styles.popupRow}>
        <b>Costo mensual de sueldos:</b> {money(p.monthlySalaryCost)}
      </div>
      <div className={styles.popupRow}>
        <b>Ahorro mensual posible:</b> {money(p.monthlySavings)}
      </div>
    </div>
  )
}
