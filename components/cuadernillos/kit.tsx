'use client'

import { useEffect, useId, useState, type ReactNode } from 'react'
import { Minus, Plus } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

/**
 * Shared building blocks of the cuadernillos screens: KPIs, chips, panels, modal, stepper.
 * Layout rules that inline styles cannot express (hover, focus, breakpoints) live in KitStyles.
 */
const CSS = `
.cdl-page { overflow-wrap: anywhere; }
.cdl-page > *, .cdl-page .k-min { min-width: 0; }
.k-stack { display: grid; gap: 1.5rem; }
.k-head { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: .75rem 1rem; }
.k-head h2 { margin: 0; font-family: var(--font-display); font-size: clamp(1.35rem, 3vw, 1.75rem); line-height: 1.1; color: var(--ink); }
.k-head p { margin: .25rem 0 0; color: var(--ink-soft); }

.k-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 8.5rem), 1fr)); gap: .75rem; margin: 0; padding: 0; list-style: none; }
.k-kpi { display: grid; gap: .2rem; padding: .9rem 1rem; border: 1px solid var(--line); border-radius: var(--r-lg); background: var(--card); }
.k-kpi dt, .k-kpi-label { color: var(--ink-soft); font-size: .85rem; font-weight: 600; }
.k-kpi dd, .k-kpi-value { margin: 0; color: var(--ink); font-family: var(--font-display); font-size: 1.9rem; line-height: 1.05; font-variant-numeric: tabular-nums; }
.k-kpi-hint { color: var(--ink-faint); font-size: .8rem; }
.k-kpi[data-tone="warn"] { border-color: var(--warn); background: var(--warn-tint); }
.k-kpi[data-tone="ok"] .k-kpi-value { color: var(--ok); }

.k-chip { display: inline-flex; align-items: center; gap: .3rem; padding: .12rem .6rem; border-radius: var(--r-pill); border: 1px solid var(--line); background: var(--fill); color: var(--ink-soft); font-size: .78rem; font-weight: 700; white-space: nowrap; }
.k-chip[data-tone="warn"] { border-color: var(--warn); background: var(--warn-tint); color: var(--warn); }
.k-chip[data-tone="ok"] { border-color: var(--ok); background: var(--ok-tint); color: var(--ok); }
.k-chip[data-tone="danger"] { border-color: var(--danger-mark); background: var(--danger-tint); color: var(--danger-ink); }
.k-chip[data-tone="info"] { border-color: var(--info); background: var(--info-tint); color: var(--info); }

.k-panel { display: grid; gap: .75rem; }
.k-panel-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: .5rem 1rem; }
.k-panel-head h3 { margin: 0; font-family: var(--font-display); font-size: 1.1rem; color: var(--ink); }
.k-panel-head span { color: var(--ink-soft); font-size: .88rem; }

.k-list { display: grid; gap: .5rem; margin: 0; padding: 0; list-style: none; }
.k-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: .35rem 1rem; width: 100%; box-sizing: border-box; min-height: 44px; padding: .8rem 1rem; text-align: left; border: 1px solid var(--line); border-radius: var(--r-lg); background: var(--card); color: var(--ink); font: inherit; }
button.k-row { cursor: pointer; }
button.k-row:hover { border-color: var(--ink-soft); background: var(--fill); }
button.k-row:focus-visible, .k-link:focus-visible { outline: 2px solid var(--marker); outline-offset: 2px; }
.k-row-main { display: grid; gap: .2rem; min-width: 0; }
.k-row-title { font-weight: 700; color: var(--ink); }
.k-row-meta { color: var(--ink-soft); font-size: .85rem; }
.k-row-side { display: flex; align-items: center; gap: .6rem; justify-content: flex-end; flex-wrap: wrap; }
.k-row-num { font-family: var(--font-display); font-size: 1.25rem; font-variant-numeric: tabular-nums; color: var(--ink); }

.k-meter { height: .45rem; border-radius: var(--r-pill); background: var(--line-soft); overflow: hidden; }
.k-meter > span { display: block; height: 100%; border-radius: inherit; background: var(--ink); }
.k-meter[data-tone="warn"] > span { background: var(--warn); }

.k-empty { display: grid; justify-items: start; gap: .5rem; padding: 1.25rem; border: 1px dashed var(--line); border-radius: var(--r-lg); background: var(--fill); }
.k-empty strong { color: var(--ink); }
.k-empty p { margin: 0; color: var(--ink-soft); }

.k-note { margin: 0; padding: .7rem 1rem; border-left: 4px solid var(--marker); background: var(--fill); color: var(--ink); }
.k-note[data-tone="ok"] { border-left-color: var(--ok); background: var(--ok-tint); }
.k-note[data-tone="danger"] { border-left-color: var(--danger-mark); background: var(--danger-tint); color: var(--danger-ink); }

.k-seg { display: inline-flex; flex-wrap: wrap; gap: .25rem; padding: .25rem; border-radius: var(--r-pill); background: var(--fill); border: 1px solid var(--line); }
.k-seg button { min-height: 36px; padding: .25rem .9rem; border: 0; border-radius: var(--r-pill); background: transparent; color: var(--ink-soft); font: inherit; font-weight: 600; cursor: pointer; }
.k-seg button[aria-pressed="true"] { background: var(--ink); color: var(--white); }
.k-seg button:focus-visible { outline: 2px solid var(--marker); outline-offset: 2px; }

.k-modal.k-modal { display: flex; flex-direction: column; width: min(34rem, calc(100vw - 2rem)); max-height: min(44rem, calc(100dvh - 2rem)); padding: 0; overflow: hidden; }
.k-modal-head { display: grid; gap: .25rem; padding: 1.25rem 3.5rem 1rem 1.5rem; border-bottom: 1px solid var(--line); }
.k-modal-head p { margin: 0; color: var(--ink-soft); font-size: .9rem; }
.k-modal-title { margin: 0; padding: 0 !important; font-family: var(--font-display); font-size: 1.3rem !important; font-weight: 700; line-height: 1.15; text-transform: none !important; color: var(--ink); }
.k-modal-body { display: grid; gap: 1rem; align-content: start; padding: 1.25rem 1.5rem; overflow-y: auto; flex: 1 1 auto; min-height: 0; }
.k-modal-foot { display: flex; flex-wrap: wrap; gap: .5rem; padding: .9rem 1.5rem; border-top: 1px solid var(--line); background: var(--card); }
.k-modal-foot > * { flex: 1 1 8rem; min-height: 44px; }
@media (max-width: 640px) {
  .k-modal-head { padding-left: 1rem; }
  .k-modal-body { padding: 1rem; }
  .k-modal-foot { padding-left: 1rem; padding-right: 1rem; }
}

.k-field { display: grid; gap: .35rem; }
.k-field > label, .k-field > span.k-label { color: var(--ink); font-weight: 600; }
.k-hint { color: var(--ink-soft); font-size: .82rem; }
.k-qty-list { display: grid; gap: .5rem; margin: 0; padding: 0; list-style: none; }
.k-qty-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: .75rem; padding: .65rem .8rem; border: 1px solid var(--line); border-radius: var(--r-lg); background: var(--card); }
.k-qty-row[data-active="true"] { border-color: var(--ink); background: var(--fill); }
.k-step { display: inline-flex; align-items: center; border: 1px solid var(--line); border-radius: var(--r-md); background: var(--card); }
.k-step button { display: grid; place-items: center; width: 40px; min-height: 40px; border: 0; background: transparent; color: var(--ink); cursor: pointer; }
.k-step button:disabled { opacity: .35; cursor: not-allowed; }
.k-step button:focus-visible, .k-step input:focus-visible { outline: 2px solid var(--marker); outline-offset: -2px; }
.k-step input { width: 4.2rem; min-height: 40px; box-sizing: border-box; border: 0; border-inline: 1px solid var(--line); text-align: center; font: inherit; font-variant-numeric: tabular-nums; background: transparent; color: var(--ink); -moz-appearance: textfield; }
.k-step input::-webkit-outer-spin-button, .k-step input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.k-link { color: var(--accent); }
.k-total { display: flex; justify-content: space-between; align-items: baseline; gap: .5rem; padding: .25rem .1rem; color: var(--ink-soft); }
.k-total strong { color: var(--ink); font-family: var(--font-display); font-size: 1.4rem; font-variant-numeric: tabular-nums; }
`

export function KitStyles() {
  return <style>{CSS}</style>
}

export type Tone = 'neutral' | 'ok' | 'warn' | 'danger' | 'info'

export function PageHeader({ id, title, description, action }: { id?: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <header className="k-head">
      <div className="k-min">
        <h2 id={id}>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {action ? <div>{action}</div> : null}
    </header>
  )
}

export type Kpi = { label: string; value: string | number; hint?: string; tone?: 'warn' | 'ok' }

export function KpiStrip({ items, label }: { items: Kpi[]; label: string }) {
  return (
    <dl aria-label={label} className="k-kpis">
      {items.map((item) => (
        <div key={item.label} className="k-kpi" data-tone={item.tone}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
          {item.hint ? <span className="k-kpi-hint">{item.hint}</span> : null}
        </div>
      ))}
    </dl>
  )
}

export function Chip({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className="k-chip" data-tone={tone === 'neutral' ? undefined : tone}>{children}</span>
}

export function Panel({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="k-panel">
      <div className="k-panel-head">
        <h3 id={id}>{title}</h3>
        {aside ? <span>{aside}</span> : null}
      </div>
      {children}
    </section>
  )
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="k-empty">
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
      {action}
    </div>
  )
}

export function Note({ tone, role, children }: { tone?: 'ok' | 'danger'; role?: 'status' | 'alert'; children: ReactNode }) {
  return <p role={role ?? (tone === 'danger' ? 'alert' : 'status')} className="k-note" data-tone={tone}>{children}</p>
}

export function Meter({ value, max, label, tone }: { value: number; max: number; label: string; tone?: 'warn' }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, Math.round((value / max) * 100))) : 0
  return (
    <div className="k-meter" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.min(value, max)} data-tone={tone}>
      <span style={{ width: `${pct}%` }} />
    </div>
  )
}

export function Segmented<T extends string>({ label, value, options, onChange }: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div role="group" aria-label={label} className="k-seg">
      {options.map((option) => (
        <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  )
}

/** Centered modal dialog. Compose with ModalBody and ModalFoot. */
export function Modal({ open, title, description, onClose, children }: {
  open: boolean
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="k-modal">
        <div className="k-modal-head">
          <DialogTitle className="k-modal-title">{title}</DialogTitle>
          {description ? <p>{description}</p> : null}
        </div>
        {children}
      </DialogContent>
    </Dialog>
  )
}

export function ModalBody({ children }: { children: ReactNode }) {
  return <div className="k-modal-body">{children}</div>
}

export function ModalFoot({ children }: { children: ReactNode }) {
  return <div className="k-modal-foot">{children}</div>
}

export function Stepper({ label, value, max, disabled, onChange }: {
  label: string
  value: number
  max?: number
  disabled?: boolean
  onChange: (value: number) => void
}) {
  const clamp = (next: number) => Math.min(max ?? Number.MAX_SAFE_INTEGER, Math.max(0, Math.trunc(Number.isFinite(next) ? next : 0)))
  return (
    <div className="k-step">
      <button type="button" aria-label={`Restar · ${label}`} disabled={disabled || value <= 0} onClick={() => onChange(clamp(value - 1))}><Minus aria-hidden size={16} /></button>
      <input
        aria-label={label} type="number" inputMode="numeric" min={0} max={max} step={1} disabled={disabled}
        value={value}
        onChange={(event) => onChange(clamp(Number(event.target.value)))}
      />
      <button type="button" aria-label={`Sumar · ${label}`} disabled={disabled || (max !== undefined && value >= max)} onClick={() => onChange(clamp(value + 1))}><Plus aria-hidden size={16} /></button>
    </div>
  )
}

export function useIsPhone() {
  const [phone, setPhone] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(max-width: 640px)')
    const update = () => setPhone(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return phone
}

/** Plain count with Spanish thousands separators. */
export function formatCount(value: number) {
  return value.toLocaleString('es-AR')
}

/** Short grade label for tiles and steppers: "Cuadernillo para estudiantes de 1.er grado" -> "1.er grado". */
export function shortProduct(label: string) {
  const short = label
    .replace(/^Cuadernillo para estudiantes (de|del) /i, '')
    .replace(/^Cuadernillo /i, '')
    .trim()
  return short ? short.charAt(0).toUpperCase() + short.slice(1) : label
}
