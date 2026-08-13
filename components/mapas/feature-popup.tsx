'use client'

import type { ReactNode } from 'react'
import {
  COPY,
  demandaActualTexto,
  demandaFuturaTexto,
  semaforoGlosa,
} from '@/lib/copy/didactica'
import type {
  ApiEnrollment,
  ApiEnrollmentData,
  SelectedFeature,
} from '@/lib/map-types'
import {
  normalizeDept,
  type Semaforo,
  type SobreofertaData,
} from '@/lib/sobreoferta'
import { useOverlayStyles } from '@/components/mapas/overlay-styles'

type Props = {
  feature: SelectedFeature
  api: ApiEnrollmentData | null
  sobreoferta?: SobreofertaData | null
  sobreofertaOn?: boolean
}

function money(n: number | null | undefined) {
  if (n == null) return '—'
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 2,
  }).format(n)
}

function fmt(n: number | null | undefined) {
  if (n == null) return '—'
  return new Intl.NumberFormat('es-AR').format(n)
}

function pct(n: number | null | undefined) {
  if (n == null) return '—'
  return `${n.toFixed(1)}%`
}

function pctFrac(n: number | null | undefined) {
  if (n == null) return '—'
  return `${(n * 100).toFixed(1)}%`
}

function Section({
  title,
  hint,
  children,
}: {
  title: string
  hint: string
  children: ReactNode
}) {
  const styles = useOverlayStyles()
  return (
    <>
      <hr className={styles.popupRule} />
      <div className={styles.sectionTitle}>{title}</div>
      <div className={styles.hint}>{hint}</div>
      {children}
    </>
  )
}

type DemandSignals = {
  semaforo: Semaforo
  label: string
  alumnosPorEdificio: number | null
  medianaAlumnos: number
  bajoDemanda: boolean
  variacionNatalidad: number | null
  medianaNatalidad: number
  natalidadEnCaida: boolean
  context?: {
    tasaAsistencia4: number
    icseQuintil: number
  }
  multiDept?: { name: string; share: number }[]
}

function DemandBlock({ signals }: { signals: DemandSignals }) {
  const styles = useOverlayStyles()
  const futura = demandaFuturaTexto({
    variacion: signals.variacionNatalidad,
    mediana: signals.medianaNatalidad,
    enCaida: signals.natalidadEnCaida,
  })
  const actual = demandaActualTexto({
    alumnos: signals.alumnosPorEdificio,
    mediana: signals.medianaAlumnos,
    bajoDemanda: signals.bajoDemanda,
  })

  return (
    <Section title={COPY.popup.demandSection} hint={COPY.popup.demandHint}>
      <div className={styles.popupRow}>
        <b>
          {COPY.popup.semaforo}: {signals.label}
        </b>
      </div>
      <div className={styles.hint}>{semaforoGlosa(signals.semaforo)}</div>

      <div className={styles.popupRow}>
        <b>{COPY.popup.signalFuture}</b>
      </div>
      <div className={styles.popupMuted}>{futura.dato}</div>
      <div className={styles.hint}>
        {futura.lead}
        <b className={styles.emphasis}>{futura.emphasis}</b>
      </div>

      <div className={styles.popupRow}>
        <b>{COPY.popup.signalToday}</b>
      </div>
      <div className={styles.popupMuted}>{actual.dato}</div>
      <div className={styles.hint}>{actual.lectura}</div>

      {signals.multiDept && signals.multiDept.length > 0 && (
        <>
          <div className={styles.popupRow}>
            <b>{COPY.popup.deptShare}:</b>
          </div>
          {signals.multiDept.map((dep) => (
            <div key={dep.name} className={styles.popupMuted}>
              {dep.name}: {(dep.share * 100).toFixed(0)}%
            </div>
          ))}
        </>
      )}

      {signals.context && (
        <>
          <div className={styles.popupRow}>
            <b>{COPY.popup.contextExtra}</b>
          </div>
          <div className={styles.popupMuted}>
            {COPY.popup.tasaAsistencia4}: {pctFrac(signals.context.tasaAsistencia4)}
          </div>
          <div className={styles.popupMuted}>
            {COPY.popup.icseQuintil}: {signals.context.icseQuintil}
          </div>
        </>
      )}
    </Section>
  )
}

function ApiTimeline({
  entry,
  ciclos,
}: {
  entry: ApiEnrollment
  ciclos: number[]
}) {
  const styles = useOverlayStyles()
  const years = [...ciclos].sort((a, b) => a - b)
  const current = Math.max(...years)
  const currentYear = entry.years[String(current)]
  if (!currentYear) return null

  const share = (n: number) =>
    currentYear.inicio > 0
      ? `${((n / currentYear.inicio) * 100).toFixed(1)}%`
      : null

  return (
    <Section title={COPY.popup.apiSection} hint={COPY.popup.apiHint}>
      {years.map((y) => {
        const st = entry.years[String(y)]
        if (!st) {
          return (
            <div key={y} className={styles.popupMuted}>
              {y}: —
            </div>
          )
        }
        return (
          <div key={y} className={styles.popupMuted}>
            {y}: {fmt(st.inicio)} → {st.fin != null ? fmt(st.fin) : '—'}
          </div>
        )
      })}
      <div className={styles.popupRow}>
        <b>
          {COPY.popup.sobreedad} {current}:
        </b>{' '}
        {fmt(currentYear.sobreedad)} {share(currentYear.sobreedad) ?? ''}
      </div>
      {currentYear.repitencia != null && (
        <div className={styles.popupRow}>
          <b>
            {COPY.popup.repitencia} {current}:
          </b>{' '}
          {fmt(currentYear.repitencia)} {share(currentYear.repitencia) ?? ''}
        </div>
      )}
      {Object.keys(entry.byOffer).length > 0 && (
        <>
          <div className={styles.popupRow}>
            <b>
              {COPY.popup.byOffer} ({current}):
            </b>
          </div>
          {Object.entries(entry.byOffer).map(([offer, s]) => (
            <div key={offer} className={styles.popupMuted}>
              {offer}: {fmt(s.inicio)} → {fmt(s.fin)}
            </div>
          ))}
        </>
      )}
      {Object.keys(entry.byTurn).length > 0 && (
        <>
          <div className={styles.popupRow}>
            <b>
              {COPY.popup.byTurn} ({current}):
            </b>
          </div>
          {Object.entries(entry.byTurn).map(([turno, s]) => (
            <div key={turno} className={styles.popupMuted}>
              {turno}: {fmt(s.inicio)}
            </div>
          ))}
        </>
      )}
    </Section>
  )
}

export function FeaturePopup({
  feature,
  api,
  sobreoferta = null,
  sobreofertaOn = false,
}: Props) {
  const styles = useOverlayStyles()

  if (feature.kind === 'establishment') {
    const p = feature.properties
    const apiEntry = p.cue ? api?.byCue[p.cue] : undefined
    const dept =
      sobreofertaOn && sobreoferta && p.department
        ? sobreoferta.departments[normalizeDept(p.department)]
        : undefined

    return (
      <div className={styles.popup}>
        <h3 className={styles.popupTitle}>{p.name ?? 'Establecimiento'}</h3>
        <div className={styles.popupRow}>
          <b>{COPY.popup.cue}:</b> {p.cue ?? '—'}
        </div>
        <div className={styles.popupRow}>
          <b>{COPY.popup.locality}:</b> {p.locality ?? '—'}
        </div>
        <div className={styles.popupRow}>
          <b>{COPY.popup.department}:</b> {p.department ?? '—'}
        </div>
        <div className={styles.popupRow}>
          <b>{COPY.popup.zone}:</b> {p.zone ?? '—'}
        </div>

        <Section
          title={COPY.popup.enrollmentSection}
          hint={COPY.popup.enrollmentHint}
        >
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
            <b>{COPY.popup.absChange}:</b> {p.absChange ?? '—'}
          </div>
          <div className={styles.popupRow}>
            <b>{COPY.popup.pctChange}:</b> {pct(p.pctChange)}
          </div>
          <div className={styles.popupRow}>
            <b>{COPY.popup.trend}:</b> {p.trendLabel ?? '—'}
          </div>
        </Section>

        <Section title={COPY.popup.costsSection} hint={COPY.popup.costsHint}>
          <div className={styles.popupRow}>
            <b>{COPY.popup.monthlySalary}:</b> {money(p.monthlySalaryCost)}
          </div>
        </Section>

        {dept && sobreoferta && (
          <DemandBlock
            signals={{
              semaforo: dept.semaforo,
              label: sobreoferta.meta.colors[dept.semaforo].label,
              alumnosPorEdificio: dept.alumnosPorEdificio,
              medianaAlumnos: sobreoferta.meta.medianAlumnosPorEdificioDept,
              bajoDemanda: dept.bajoDemanda,
              variacionNatalidad: dept.variacionNatalidad,
              medianaNatalidad: sobreoferta.meta.medianVariacionNatalidad,
              natalidadEnCaida: dept.natalidadEnCaida,
              context: {
                tasaAsistencia4: dept.tasaAsistencia4,
                icseQuintil: dept.icseQuintil,
              },
            }}
          />
        )}

        {apiEntry && Object.keys(apiEntry.years).length > 0 && (
          <ApiTimeline entry={apiEntry} ciclos={api?.ciclos ?? []} />
        )}
      </div>
    )
  }

  const p = feature.properties
  const zone =
    sobreofertaOn && sobreoferta ? sobreoferta.zones[p.name] : undefined

  return (
    <div className={styles.popup}>
      <h3 className={styles.popupTitle}>{p.name}</h3>
      <div className={styles.popupRow}>
        <b>{COPY.popup.diameter}:</b> {p.diameterKm ?? 20} km
      </div>
      <div className={styles.popupRow}>
        <b>{COPY.popup.establishments}:</b> {p.establishments ?? '—'}
      </div>
      <div className={styles.popupRow}>
        <b>{COPY.popup.zoneCompleteCount}:</b> {p.completeHistory ?? '—'}
      </div>

      <Section
        title={COPY.popup.enrollmentSection}
        hint={COPY.popup.enrollmentHint}
      >
        <div className={styles.popupRow}>
          <b>{COPY.popup.zoneAllSchools}</b>
        </div>
        <div className={styles.popupMuted}>
          2023: {p.observable?.[2023] ?? '—'} · 2024:{' '}
          {p.observable?.[2024] ?? '—'} · 2025: {p.observable?.[2025] ?? '—'} ·
          2026: {p.observable?.[2026] ?? '—'}
        </div>
        <div className={styles.popupRow}>
          <b>{COPY.popup.zoneCompleteHistory}</b>
        </div>
        <div className={styles.popupMuted}>
          2023: {p.comparable?.[2023] ?? '—'} · 2026:{' '}
          {p.comparable?.[2026] ?? '—'}
        </div>
        <div className={styles.popupRow}>
          <b>{COPY.popup.pctChange}:</b> {pct(p.pctChange)}
        </div>
        <div className={styles.popupRow}>
          <b>{COPY.popup.trend}:</b> {p.trendLabel ?? '—'}
        </div>
        <div className={styles.popupRow}>
          <b>{COPY.popup.upDownFlat}:</b> {p.upCount ?? '—'} / {p.downCount ?? '—'}{' '}
          / {p.flatCount ?? '—'}
        </div>
      </Section>

      <Section title={COPY.popup.costsSection} hint={COPY.popup.costsHint}>
        <div className={styles.popupRow}>
          <b>{COPY.popup.monthlySalary}:</b> {money(p.monthlySalaryCost)}
        </div>
        <div className={styles.popupRow}>
          <b>{COPY.popup.monthlySavings}:</b> {money(p.monthlySavings)}
        </div>
      </Section>

      {zone && sobreoferta && (
        <DemandBlock
          signals={{
            semaforo: zone.semaforo,
            label: sobreoferta.meta.colors[zone.semaforo].label,
            alumnosPorEdificio: zone.alumnosPorEdificio,
            medianaAlumnos: sobreoferta.meta.medianAlumnosPorEdificio,
            bajoDemanda: zone.bajoDemanda,
            variacionNatalidad: zone.variacionNatalidad,
            medianaNatalidad: sobreoferta.meta.medianVariacionNatalidad,
            natalidadEnCaida: zone.natalidadEnCaida,
            multiDept: zone.multiDepartment
              ? zone.departments.map((d) => ({
                  name: d.name,
                  share: d.share,
                }))
              : undefined,
          }}
        />
      )}
    </div>
  )
}
