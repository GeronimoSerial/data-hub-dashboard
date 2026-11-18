'use client'

import { useEffect, useId, useState, type ReactNode } from 'react'
import { Minus, Plus } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

/**
 * Shared building blocks of the cuadernillos screens: KPIs, chips, panels, modal, stepper.
 * Layout rules that inline styles cannot express (hover, focus, breakpoints) live in KitStyles.
 */
const CSS = `
.cdl-page { display: grid; gap: .75rem; width: 100%; max-width: 72rem; box-sizing: border-box; margin: 0 auto; padding: clamp(1.25rem, 3vw, 2.25rem) var(--gutter, clamp(1.25rem, 4vw, 3rem)) 3rem; color: var(--ink); overflow-wrap: anywhere; }
/* Planeamiento is a working board: it uses the full measure of the hub. */
.cdl-page[data-wide] { max-width: var(--measure, 90rem); }
.cdl-eyebrow { margin: 0; color: var(--ink-soft); font-family: var(--font-body); font-size: .8rem; font-weight: 600; line-height: 1.2; letter-spacing: .08em; text-transform: uppercase; }
.cdl-sections { display: grid; gap: 1.5rem; }
.cdl-page > *, .cdl-page .k-min { min-width: 0; }
/* Section headings in sentence case: the hub's uppercase display style reads as labels here. */
.cdl-page h3, .cdl-page h4 { text-transform: none; letter-spacing: 0; }
.k-stack { display: grid; gap: 1rem; }
.k-head { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: .75rem 1rem; }
.k-head h2 { margin: 0; font-family: var(--font-display); font-size: clamp(1.35rem, 3vw, 1.75rem); line-height: 1.1; color: var(--ink); }
.k-head p { margin: .25rem 0 0; color: var(--ink-soft); }

.k-kpis { display: flex; flex-wrap: wrap; gap: .5rem 2.5rem; margin: 0; padding: .25rem 0 .75rem; list-style: none; border-bottom: 1px solid var(--line); }
.k-kpi { display: flex; flex-direction: column-reverse; gap: 0; }
.k-kpi dt, .k-kpi-label { color: var(--ink-soft); font-size: .85rem; font-weight: 600; }
.k-kpi dd, .k-kpi-value { margin: 0; color: var(--ink); font-family: var(--font-display); font-size: 1.45rem; line-height: 1.05; font-variant-numeric: tabular-nums; }
.k-kpi-hint { color: var(--ink-faint); font-size: .8rem; }
.k-kpi[data-tone="warn"] .k-kpi-value, .k-kpi[data-tone="warn"] dd { color: var(--warn); }
.k-kpi[data-tone="ok"] .k-kpi-value { color: var(--ok); }

.k-chip { display: inline-flex; align-items: center; color: var(--ink-soft); font-size: .82rem; font-weight: 600; white-space: nowrap; }
.k-chip[data-tone="warn"] { color: var(--warn); }
.k-chip[data-tone="ok"] { color: var(--ok); }
.k-chip[data-tone="danger"] { color: var(--danger-ink); }
.k-chip[data-tone="info"] { color: var(--info); }

.k-panel { display: grid; gap: .5rem; }
.k-panel-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: .5rem 1rem; }
.k-panel-head h3 { margin: 0; font-family: var(--font-display); font-size: 1.1rem; text-transform: none; letter-spacing: 0; color: var(--ink); }
.k-panel-head span { color: var(--ink-soft); font-size: .88rem; }

.k-list { display: grid; gap: 0; margin: 0; padding: 0; list-style: none; border-top: 1px solid var(--line); }
.k-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: .2rem .75rem; width: 100%; box-sizing: border-box; min-height: 0; padding: .45rem .25rem; text-align: left; border: 0; border-bottom: 1px solid var(--line); border-radius: 0; background: transparent; color: var(--ink); font: inherit; }
button.k-row { cursor: pointer; }
button.k-row:hover { background: var(--fill); }
button.k-row:focus-visible, .k-link:focus-visible { outline: 2px solid var(--marker); outline-offset: 2px; }
.k-row-main { display: grid; gap: .2rem; min-width: 0; }
.k-row-title { font-weight: 600; color: var(--ink); }
.k-row-meta { color: var(--ink-soft); font-size: .85rem; }
.k-row-side { display: flex; align-items: center; gap: .6rem; justify-content: flex-end; flex-wrap: wrap; }
.k-row-num { font-family: var(--font-display); font-size: 1.05rem; font-variant-numeric: tabular-nums; color: var(--ink); }

.k-meter { height: .45rem; border-radius: var(--r-pill); background: var(--line-soft); overflow: hidden; }
.k-meter > span { display: block; height: 100%; border-radius: inherit; background: var(--ink); }
.k-meter[data-tone="warn"] > span { background: var(--warn); }

.k-empty { display: grid; justify-items: start; gap: .3rem; padding: .25rem 0; }
.k-empty strong { color: var(--ink); }
.k-empty p { margin: 0; color: var(--ink-soft); }

.k-note { margin: 0; color: var(--ink-soft); }
.k-note[data-tone] { padding: .45rem .8rem; border-left: 3px solid; color: var(--ink); }
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
.k-modal.k-modal--wide { width: min(64rem, calc(100vw - 2rem)); height: min(46rem, calc(100dvh - 2rem)); max-height: none; }
.k-modal--wide .k-modal-foot { align-items: center; justify-content: flex-end; }
.k-modal--wide .k-modal-foot > .ui-button { flex: 0 0 auto; min-width: 9.5rem; }
@media (max-width: 640px) {
  .k-modal--wide .k-modal-foot > .ui-button { flex: 1 1 8rem; min-width: 0; }
  .k-modal-head { padding-left: 1rem; }
  .k-modal-body { padding: 1rem; }
  .k-modal-foot { padding-left: 1rem; padding-right: 1rem; }
}

.k-field { display: grid; gap: .35rem; }
.k-field > label, .k-field > span.k-label { color: var(--ink); font-weight: 600; }
.k-hint { color: var(--ink-soft); font-size: .82rem; }
.k-qty-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 14rem), 1fr)); gap: 0 2rem; margin: 0; padding: 0; list-style: none; }
.k-qty-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: .5rem; min-height: 2.1rem; padding: .15rem 0; border-bottom: 1px solid var(--line); font-size: .9rem; }
.k-qty-row[data-active="true"] { color: var(--ink); }
.k-step { display: inline-flex; align-items: center; border: 1px solid var(--line); border-radius: var(--r-md); background: var(--card); }
.k-step button { display: grid; place-items: center; width: 28px; min-height: 28px; border: 0; background: transparent; color: var(--ink); cursor: pointer; }
.k-step button:disabled { opacity: .35; cursor: not-allowed; }
.k-step button:focus-visible, .k-step input:focus-visible { outline: 2px solid var(--marker); outline-offset: -2px; }
.k-step input { width: 3.4rem; min-height: 28px; box-sizing: border-box; border: 0; border-inline: 1px solid var(--line); text-align: center; font: inherit; font-variant-numeric: tabular-nums; background: transparent; color: var(--ink); -moz-appearance: textfield; }
.k-step input::-webkit-outer-spin-button, .k-step input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.k-link { color: var(--accent); }
.k-total { display: flex; justify-content: space-between; align-items: baseline; gap: .5rem; padding: .25rem .1rem; color: var(--ink-soft); }
.k-total strong { color: var(--ink); font-family: var(--font-display); font-size: 1.4rem; font-variant-numeric: tabular-nums; }

.k-task { display: grid; gap: .35rem; justify-items: start; padding: 0 0 .25rem; }
.k-task h3 { margin: 0; font-family: var(--font-display); font-size: clamp(1.2rem, 2.6vw, 1.45rem); line-height: 1.2; text-transform: none; letter-spacing: 0; color: var(--ink); }
.k-task p { margin: 0; color: var(--ink-soft); }
.k-task[data-tone="warn"] h3 { color: var(--ink); }

/* Sequential stepper: numbered markers joined by a rail; filled = confirmed, ring = next, hollow = later. */
.k-journey { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); margin: 0; padding: 0; list-style: none; counter-reset: k-step; }
.k-journey li { position: relative; display: grid; justify-items: start; align-content: start; gap: .15rem; padding-right: 1rem; color: var(--ink-soft); font-size: .84rem; }
.k-journey li::after { content: ""; position: absolute; top: .65rem; left: 1.9rem; right: .4rem; height: 2px; background: var(--line); }
.k-journey li:last-child::after { display: none; }
.k-journey li[data-state="done"]::after { background: var(--ok); }
.k-journey-mark { display: grid; place-items: center; width: 1.4rem; height: 1.4rem; margin-bottom: .2rem; border-radius: 50%; border: 2px solid var(--line); background: var(--card); color: var(--ink-soft); font-size: .75rem; font-weight: 700; font-variant-numeric: tabular-nums; }
.k-journey li strong { color: var(--ink-soft); font-size: .9rem; font-weight: 600; }
.k-journey li[data-state="done"] .k-journey-mark { border-color: var(--ok); background: var(--ok); color: var(--white); }
.k-journey li[data-state="done"] strong { color: var(--ink); }
.k-journey li[data-state="short"] .k-journey-mark { border-color: var(--warn); background: var(--warn); color: var(--white); }
.k-journey li[data-state="short"] strong { color: var(--warn); }
.k-journey li[data-state="current"] .k-journey-mark { border-color: var(--ink); color: var(--ink); }
.k-journey li[data-state="current"] strong { color: var(--ink); }
@media (max-width: 640px) {
  .k-journey { grid-auto-flow: row; gap: .7rem; }
  .k-journey li { grid-template-columns: auto minmax(0, 1fr); column-gap: .6rem; padding-right: 0; }
  .k-journey-mark { grid-row: span 2; margin-bottom: 0; }
  .k-journey li::after { top: 1.6rem; bottom: -.6rem; left: .64rem; right: auto; width: 2px; height: auto; }
}

.k-guide { display: grid; gap: .3rem; color: var(--ink-soft); font-size: .9rem; }
.k-guide-head { display: flex; align-items: baseline; gap: .75rem; }
.k-guide-head strong { color: var(--ink); font-weight: 600; }
.k-guide ol { margin: 0; padding-left: 1.25rem; display: grid; gap: .1rem; }
.k-guide button { padding: 0; border: 0; background: transparent; color: var(--accent); font: inherit; font-size: .85rem; text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
.k-guide button:focus-visible { outline: 2px solid var(--marker); outline-offset: 2px; }

/* Receipt: what is being sent, itemised like a printed delivery note. */
.k-receipt { display: grid; gap: .75rem; padding: .25rem 0; font-variant-numeric: tabular-nums; }
.k-receipt-head { display: grid; gap: .05rem; padding-bottom: .6rem; border-bottom: 2px solid var(--ink); }
.k-receipt-head span { color: var(--ink-soft); font-size: .82rem; }
.k-receipt-head strong { color: var(--ink); font-size: 1.05rem; }
.k-receipt-group h4 { margin: 0 0 .2rem; font-size: .95rem; font-weight: 600; text-transform: none; letter-spacing: 0; color: var(--ink); }
.k-receipt-group dl { margin: 0; display: grid; }
.k-receipt-group dl > div { display: flex; align-items: baseline; gap: .5rem; padding: .1rem 0; color: var(--ink-soft); font-size: .9rem; }
.k-receipt-group dl > div::after { content: ""; order: 1; flex: 1; border-bottom: 1px dotted var(--line); transform: translateY(-.25rem); }
.k-receipt-group dt { order: 0; }
.k-receipt-group dd { order: 2; margin: 0; color: var(--ink); font-weight: 600; }
.k-receipt-total { display: flex; justify-content: space-between; align-items: baseline; margin: 0; padding-top: .6rem; border-top: 2px solid var(--ink); color: var(--ink-soft); }
.k-receipt-total strong { color: var(--ink); font-size: 1.05rem; }

/* Wizard: one question per step, a progress bar, and at most Atrás + one primary action. */
.k-wiz { display: grid; gap: 1.25rem; width: 100%; max-width: 40rem; box-sizing: border-box; margin: 0 auto; }
.k-wiz-head { display: grid; gap: .5rem; }
.k-wiz-count { margin: 0; color: var(--ink-soft); font-size: .85rem; font-weight: 600; font-variant-numeric: tabular-nums; }
.k-wiz-bar { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: .3rem; }
.k-wiz-bar > span { height: 4px; background: var(--line); transition: background-color 160ms ease-out; }
.k-wiz-bar > span[data-on] { background: var(--ink); }
.k-wiz-title { margin: 0; font-family: var(--font-display); font-size: clamp(1.35rem, 3.2vw, 1.8rem); line-height: 1.15; text-transform: none; letter-spacing: 0; color: var(--ink); text-wrap: balance; }
.k-wiz-sub { margin: 0; color: var(--ink-soft); }
.k-wiz-foot { display: flex; flex-wrap: wrap-reverse; align-items: center; justify-content: space-between; gap: .75rem; padding-top: .5rem; }
.k-wiz-foot > .ui-button:last-child { margin-left: auto; min-height: 48px; min-width: 11rem; }
.k-wiz-foot > .ui-button:only-child { margin-left: auto; }
.k-choices { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr)); gap: .75rem; }
.k-choice { display: grid; gap: .2rem; align-content: center; min-height: 5rem; padding: 1rem 1.25rem; box-sizing: border-box; border: 1.5px solid var(--ink); border-radius: var(--r-md); background: var(--card); color: var(--ink); font: inherit; text-align: left; cursor: pointer; transition: background-color 120ms ease-out; }
.k-choice:hover:not(:disabled) { background: var(--fill); }
.k-choice:focus-visible { outline: 2px solid var(--marker); outline-offset: 2px; }
.k-choice:disabled { opacity: .5; cursor: not-allowed; }
.k-choice strong { font-size: 1.1rem; font-weight: 700; }
.k-choice span { color: var(--ink-soft); font-size: .88rem; }
.k-choice[data-quiet] { border-color: var(--line); }
@media (prefers-reduced-motion: reduce) {
  .k-wiz-bar > span, .k-choice { transition: none; }
}

/* Dense on desktop; touch screens keep 44px targets. */
@media (pointer: coarse) {
  .k-row { min-height: 44px; }
  .k-step button { width: 40px; min-height: 40px; }
  .k-step input { min-height: 40px; }
}
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
export function Modal({ open, title, description, size, onClose, children }: {
  open: boolean
  title: string
  description?: string
  /** `wide` gives multi-step flows a roomy, fixed-height dialog so steps do not resize it. */
  size?: 'wide'
  onClose: () => void
  children: ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className={size === 'wide' ? 'k-modal k-modal--wide' : 'k-modal'}>
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

/** "Paso 2 de 3", a segmented progress bar and the question of the step. */
export function WizardHeader({ step, total, title, description }: { step: number; total: number; title: string; description?: string }) {
  return (
    <header className="k-wiz-head">
      <p className="k-wiz-count">{`Paso ${step} de ${total}`}</p>
      <div className="k-wiz-bar" role="progressbar" aria-label="Progreso" aria-valuemin={1} aria-valuemax={total} aria-valuenow={step}>
        {Array.from({ length: total }, (_, index) => <span key={index} data-on={index < step ? '' : undefined} />)}
      </div>
      <h3 className="k-wiz-title">{title}</h3>
      {description ? <p className="k-wiz-sub">{description}</p> : null}
    </header>
  )
}

/** A large answer to the question of the step; picking one moves on. */
export function Choice({ title, description, quiet, disabled, onClick }: { title: string; description?: string; quiet?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" className="k-choice" aria-label={title} data-quiet={quiet ? '' : undefined} disabled={disabled} onClick={onClick}>
      <strong>{title}</strong>
      {description ? <span>{description}</span> : null}
    </button>
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

/** The one thing the person has to do now, shown first on every role's screen. */
export function TaskCard({ title, description, action, tone }: { title: string; description?: string; action?: ReactNode; tone?: 'warn' | 'ok' }) {
  return (
    <section className="k-task" data-tone={tone} aria-label="Lo que tenés que hacer">
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
      {action}
    </section>
  )
}

export type JourneyStep = {
  label: string
  state: 'done' | 'short' | 'current' | 'pending'
  /** Who confirmed the step and when, in plain words, e.g. "Ana Pérez · 14/11 10:30". */
  detail?: string | null
}

/** "Enviado → Llegó a la cabecera → Llegó a la escuela" with who confirmed each step. */
export function ShipmentJourney({ steps, label = 'Recorrido del envío' }: { steps: JourneyStep[]; label?: string }) {
  return (
    <ol className="k-journey" aria-label={label}>
      {steps.map((step, index) => (
        <li key={step.label} data-state={step.state} aria-current={step.state === 'current' ? 'step' : undefined}>
          <span className="k-journey-mark" aria-hidden="true">{step.state === 'done' ? '✓' : step.state === 'short' ? '!' : index + 1}</span>
          <strong>{step.label}</strong>
          <span>{step.detail ?? (step.state === 'pending' || step.state === 'current' ? 'Todavía no' : '')}</span>
        </li>
      ))}
    </ol>
  )
}

const GUIDE_KEY = 'cuadernillos.guide.dismissed'

/** Three-step explanation of the circuit; dismissible per browser, always visible again when storage is unavailable. */
export function CircuitGuide() {
  const [dismissed, setDismissed] = useState(false)
  useEffect(() => {
    try {
      if (window.localStorage.getItem(GUIDE_KEY) === '1') setDismissed(true) // eslint-disable-line react-hooks/set-state-in-effect -- read once after mount to keep SSR markup stable
    } catch { /* storage unavailable: keep the guide visible */ }
  }, [])
  if (dismissed) return null
  function dismiss() {
    setDismissed(true)
    try { window.localStorage.setItem(GUIDE_KEY, '1') } catch { /* ignore */ }
  }
  return (
    <aside className="k-guide" aria-label="Cómo funciona">
      <div className="k-guide-head">
        <strong>Cómo funciona</strong>
        <button type="button" onClick={dismiss}>Entendido</button>
      </div>
      <ol>
        <li>Planeamiento envía los cuadernillos a la escuela cabecera.</li>
        <li>La cabecera confirma lo que llegó y los reparte a cada escuela.</li>
        <li>Cada escuela confirma lo que recibió.</li>
      </ol>
    </aside>
  )
}
