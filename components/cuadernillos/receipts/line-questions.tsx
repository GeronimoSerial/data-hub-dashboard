'use client'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Stepper, formatCount, shortProduct } from '../kit'
import {
  allArrived, arrivalMode, evaluateLine, lessArrived, summarizeItems,
  type LineAnswers, type ReceiptItem,
} from './receipt-model'

type Props = {
  scope: string
  items: ReceiptItem[]
  state: LineAnswers
  disabled?: boolean
  /** Accessible context for the buttons, e.g. the school name when several share a screen. */
  label?: string
  /** `less-only` hides "Sí, llegó todo" (the envío-level button answers for every school). */
  variant?: 'full' | 'less-only'
  onChange: (next: LineAnswers) => void
}

const buttonStyle = { flex: '1 1 10rem', minHeight: '2.75rem' } as const

/** The product list and one question: did everything arrive? Only "Llegó menos" opens quantities and the motivo. */
export function LineQuestions({ scope, items, state, disabled, label, variant = 'full', onChange }: Props) {
  const evaluation = evaluateLine(items, state)
  const mode = arrivalMode(items, state)
  const summary = summarizeItems(items)
  const suffix = label ? ` · ${label}` : ''

  function setQuantity(productId: string, quantity: number) {
    onChange({ ...state, answers: { ...state.answers, [productId]: { mode: 'other', quantity } } })
  }

  return (
    <div className="k-stack" style={{ gap: '.5rem' }}>
      {variant === 'less-only' ? (
        <div className="k-row">
          <span className="k-row-main">
            {label ? <strong className="k-row-title">{label}</strong> : null}
            <span className="k-row-meta">{summary ?? 'Para esta escuela no corresponden cuadernillos.'}</span>
          </span>
          {summary ? (
            <Button type="button" size="sm" variant={mode === 'less' ? 'default' : 'ghost'} disabled={disabled} aria-pressed={mode === 'less'}
              aria-label={`Llegó menos${suffix}`} onClick={() => onChange(mode === 'less' ? allArrived(items) : lessArrived(items, state))}>
              Llegó menos
            </Button>
          ) : null}
        </div>
      ) : summary ? <p style={{ margin: 0, fontWeight: 600 }}>{summary}</p> : <p className="k-hint" style={{ margin: 0 }}>Para esta escuela no corresponden cuadernillos.</p>}
      {summary && variant === 'full' ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem' }}>
          <Button type="button" style={buttonStyle} variant={mode === 'all' ? 'default' : 'secondary'} disabled={disabled} aria-pressed={mode === 'all'}
            aria-label={`Sí, llegó todo${suffix}`} onClick={() => onChange(allArrived(items))}>
            Sí, llegó todo
          </Button>
          <Button type="button" style={buttonStyle} variant={mode === 'less' ? 'default' : 'secondary'} disabled={disabled} aria-pressed={mode === 'less'}
            aria-label={`Llegó menos${suffix}`} onClick={() => onChange(lessArrived(items, state))}>
            Llegó menos
          </Button>
        </div>
      ) : null}
      {mode === 'less' ? (
        <>
          <ul className="k-qty-list">
            {items.filter((item) => item.expected > 0).map((item) => {
              const name = shortProduct(item.productName)
              const current = state.answers[item.productId]
              return (
                <li key={item.productId} className="k-qty-row" data-active="true">
                  <span>{name} <span className="k-hint">{`(de ${formatCount(item.expected)})`}</span></span>
                  <Stepper label={`Cantidad recibida · ${scope} · ${name}`} value={current?.mode === 'other' ? current.quantity : item.expected} max={item.expected} disabled={disabled}
                    onChange={(quantity) => setQuantity(item.productId, quantity)} />
                </li>
              )
            })}
          </ul>
          {evaluation.shortfall ? (
            <div className="k-field">
              <label htmlFor={`motivo-${scope}`}>¿Qué pasó?</label>
              <Textarea id={`motivo-${scope}`} rows={2} maxLength={1000} disabled={disabled} value={state.reason}
                placeholder="Contá por qué llegó menos de lo enviado"
                onChange={(event) => onChange({ ...state, reason: event.target.value })} />
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
