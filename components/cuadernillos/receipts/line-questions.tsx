'use client'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Stepper, formatCount, shortProduct } from '../kit'
import { evaluateLine, type LineAnswers, type ReceiptItem } from './receipt-model'

type Props = {
  scope: string
  items: ReceiptItem[]
  state: LineAnswers
  disabled?: boolean
  onChange: (next: LineAnswers) => void
}

/** "¿Recibió 30 cuadernillos de 1° grado?" per product; a different quantity reveals a bounded input and, on a shortfall, the motivo. */
export function LineQuestions({ scope, items, state, disabled, onChange }: Props) {
  const evaluation = evaluateLine(items, state)

  function answer(productId: string, next: LineAnswers['answers'][string]) {
    onChange({ ...state, answers: { ...state.answers, [productId]: next } })
  }

  return (
    <div className="k-stack" style={{ gap: '.6rem' }}>
      <ul className="k-qty-list">
        {items.map((item) => {
          const name = shortProduct(item.productName)
          const current = state.answers[item.productId]
          if (item.expected === 0) {
            return <li key={item.productId} className="k-qty-row"><span>{name}: no corresponde recibir cuadernillos.</span></li>
          }
          return (
            <li key={item.productId} className="k-qty-row" data-active={current ? 'true' : undefined} style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
              <strong>{`¿Recibió ${formatCount(item.expected)} ${item.expected === 1 ? 'cuadernillo' : 'cuadernillos'} de ${name}?`}</strong>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem' }}>
                <Button type="button" variant={current?.mode === 'yes' ? 'default' : 'secondary'} disabled={disabled} aria-pressed={current?.mode === 'yes'}
                  onClick={() => answer(item.productId, { mode: 'yes', quantity: item.expected })}>
                  Sí, recibí
                </Button>
                <Button type="button" variant={current?.mode === 'other' ? 'default' : 'secondary'} disabled={disabled} aria-pressed={current?.mode === 'other'}
                  onClick={() => answer(item.productId, { mode: 'other', quantity: current?.mode === 'other' ? current.quantity : item.expected })}>
                  No, recibí otra cantidad
                </Button>
              </div>
              {current?.mode === 'other' ? (
                <div className="k-field">
                  <span className="k-label">Cantidad recibida (0 a {formatCount(item.expected)})</span>
                  <Stepper label={`Cantidad recibida · ${scope} · ${name}`} value={current.quantity} max={item.expected} disabled={disabled}
                    onChange={(quantity) => answer(item.productId, { mode: 'other', quantity })} />
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
      {evaluation.shortfall ? (
        <div className="k-field">
          <label htmlFor={`motivo-${scope}`}>Motivo</label>
          <Textarea id={`motivo-${scope}`} rows={2} maxLength={1000} disabled={disabled} value={state.reason}
            placeholder="Contá por qué recibiste menos de lo enviado"
            onChange={(event) => onChange({ ...state, reason: event.target.value })} />
        </div>
      ) : null}
    </div>
  )
}
