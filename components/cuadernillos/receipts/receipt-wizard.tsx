'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Choice, Note, Stepper, WizardHeader, formatCount, shortProduct } from '../kit'
import {
  EMPTY_ANSWERS, allArrived, errorMessage, evaluateLine, lessArrived, postReceipt, reasonFor, summarizeItems, useIdempotencyKey,
  type LineAnswers, type ReceiptItem,
} from './receipt-model'

export type WizardLine = { id: string; name?: string; items: ReceiptItem[] }
export type SubmitLine = { lineId: string; items: Array<{ productId: string; receivedQuantity: number }>; shortfallReason?: string }

type Step = 'arrived' | 'quantities' | 'confirm'

type Props = {
  /** Shown above the question, e.g. "Envío del 10/11". */
  heading: string
  /** Where the envío should have arrived: "tu cabecera" or "tu escuela". */
  place: string
  lines: WizardLine[]
  /** The leg a shortfall happened on, e.g. "Planeamiento → Escuela" for a directo envío. */
  leg?: string
  /** Context worth reading before answering, e.g. what the cabecera reported. */
  note?: string | null
  /** How many more envíos wait after this one. */
  remaining?: number
  /** Where and what to post for the answered lines. */
  request: (lines: SubmitLine[]) => { url: string; body: object }
  onSigned: () => void
}

const TOTAL = 3
const SIGN = 'Confirmo que recibí estos cuadernillos'

/** One envío, one question at a time: did everything arrive? Quantities only open when something is missing. */
export function ReceiptWizard({ heading, place, lines, leg, note, remaining = 0, request, onSigned }: Props) {
  const [step, setStep] = useState<Step>('arrived')
  const [less, setLess] = useState(false)
  const [states, setStates] = useState<Record<string, LineAnswers>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const keyFor = useIdempotencyKey()

  const evaluated = lines.map((line) => {
    const state = states[line.id] ?? EMPTY_ANSWERS
    return { line, state, evaluation: evaluateLine(line.items, state) }
  })
  const complete = evaluated.every(({ evaluation }) => evaluation.complete)
  const reasonMissing = evaluated.some(({ evaluation }) => evaluation.reasonMissing)
  const receivedTotal = evaluated.reduce((sum, { evaluation }) => sum + evaluation.receivedTotal, 0)
  const expectedTotal = evaluated.reduce((sum, { evaluation }) => sum + evaluation.expectedTotal, 0)
  const several = lines.length > 1

  function answerAll() {
    setStates(Object.fromEntries(lines.map((line) => [line.id, allArrived(line.items)])))
    setLess(false)
    setError(null)
    setStep('confirm')
  }

  function answerLess() {
    setStates((current) => Object.fromEntries(lines.map((line) => [line.id, lessArrived(line.items, current[line.id] ?? EMPTY_ANSWERS)])))
    setLess(true)
    setError(null)
    setStep('quantities')
  }

  function setQuantity(lineId: string, productId: string, quantity: number) {
    setStates((current) => {
      const state = current[lineId] ?? EMPTY_ANSWERS
      return { ...current, [lineId]: { ...state, answers: { ...state.answers, [productId]: { mode: 'other', quantity } } } }
    })
  }

  async function sign() {
    const payload: SubmitLine[] = evaluated.map(({ line, state, evaluation }) => {
      const reason = reasonFor(evaluation, state)
      return { lineId: line.id, items: evaluation.items, ...(reason !== undefined ? { shortfallReason: reason } : {}) }
    })
    const { url, body } = request(payload)
    setBusy(true)
    setError(null)
    const result = await postReceipt(url, { idempotencyKey: keyFor(JSON.stringify(body)), ...body })
    setBusy(false)
    if (result.ok) onSigned()
    else setError(errorMessage(result.code))
  }

  const shortLines = evaluated.filter(({ evaluation }) => evaluation.complete && evaluation.shortfall)

  return (
    <section className="k-wiz" aria-label={heading}>
      <p className="k-hint" style={{ margin: 0 }}>{remaining > 0 ? `${heading} · ${remaining === 1 ? 'Queda 1 más' : `Quedan ${remaining} más`}` : heading}</p>

      {step === 'arrived' ? (
        <>
          <WizardHeader step={1} total={TOTAL} title={`¿Llegó todo a ${place}?`} description="Esto es lo que figura en el envío." />
          {note ? <p className="k-hint" style={{ margin: 0 }}>{note}</p> : null}
          <div className="k-stack" style={{ gap: '.6rem' }}>
            {lines.map((line) => {
              const summary = summarizeItems(line.items)
              return (
                <div key={line.id} className="k-row" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
                  {several && line.name ? <strong className="k-row-title">{line.name}</strong> : null}
                  <span style={{ fontWeight: several ? 400 : 600 }}>{summary || 'No corresponden cuadernillos.'}</span>
                </div>
              )
            })}
          </div>
          <div className="k-choices">
            <Choice title="Sí, llegó todo" description="Confirmás todo lo que figura." onClick={answerAll} />
            <Choice title="Llegó menos" description="Cargás cuánto llegó de cada uno." quiet onClick={answerLess} />
          </div>
        </>
      ) : null}

      {step === 'quantities' ? (
        <>
          <WizardHeader step={2} total={TOTAL} title="¿Cuánto llegó?" description="Bajá la cantidad de lo que llegó de menos." />
          <div className="k-stack" style={{ gap: '1rem' }}>
            {evaluated.map(({ line, state, evaluation }) => {
              const name = line.name ?? ''
              return (
                <div key={line.id} className="k-stack" style={{ gap: '.4rem' }}>
                  {several && name ? <h4 className="k-row-title" style={{ margin: 0 }}>{name}</h4> : null}
                  <ul className="k-qty-list">
                    {line.items.filter((item) => item.expected > 0).map((item) => {
                      const product = shortProduct(item.productName)
                      const current = state.answers[item.productId]
                      return (
                        <li key={item.productId} className="k-qty-row" data-active="true">
                          <span>{product} <span className="k-hint">{`(de ${formatCount(item.expected)})`}</span></span>
                          <Stepper label={`Cantidad recibida · ${line.id} · ${product}`} value={current?.mode === 'other' ? current.quantity : item.expected}
                            max={item.expected} disabled={busy} onChange={(quantity) => setQuantity(line.id, item.productId, quantity)} />
                        </li>
                      )
                    })}
                  </ul>
                  {evaluation.shortfall ? (
                    <div className="k-field">
                      <label htmlFor={`motivo-${line.id}`}>{leg ? `¿Qué pasó en el tramo ${leg}?` : several && name ? `¿Qué pasó en ${name}?` : '¿Qué pasó?'}</label>
                      <Textarea id={`motivo-${line.id}`} rows={2} maxLength={1000} disabled={busy} value={state.reason}
                        placeholder="Contá por qué llegó menos de lo enviado"
                        onChange={(event) => setStates((all) => ({ ...all, [line.id]: { ...state, reason: event.target.value } }))} />
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
          {reasonMissing ? <p className="k-hint" style={{ margin: 0 }}>Contanos qué pasó donde llegó menos para seguir.</p> : null}
          <div className="k-wiz-foot">
            <Button type="button" variant="ghost" onClick={() => setStep('arrived')}>Atrás</Button>
            <Button type="button" disabled={!complete || reasonMissing} onClick={() => setStep('confirm')}>Siguiente</Button>
          </div>
        </>
      ) : null}

      {step === 'confirm' ? (
        <>
          <WizardHeader step={3} total={TOTAL} title="Confirmá la recepción" />
          <p className="k-total" style={{ margin: 0 }}>
            <span>{receivedTotal < expectedTotal ? `Llegaron ${formatCount(receivedTotal)} de ${formatCount(expectedTotal)} cuadernillos` : `Llegaron los ${formatCount(expectedTotal)} cuadernillos`}</span>
          </p>
          {shortLines.length > 0 ? (
            <ul className="k-qty-list" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
              {shortLines.map(({ line, state, evaluation }) => (
                <li key={line.id} className="k-qty-row" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
                  <span><strong>{line.name ? `${line.name}: ` : ''}{`${formatCount(evaluation.receivedTotal)} de ${formatCount(evaluation.expectedTotal)}`}</strong>{state.reason.trim() ? <span className="k-hint">{` · ${state.reason.trim()}`}</span> : null}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {error ? <Note tone="danger">{error}</Note> : null}
          <div className="k-wiz-foot">
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setStep(less ? 'quantities' : 'arrived')}>Atrás</Button>
            <Button type="button" disabled={busy || !complete || reasonMissing} onClick={() => { void sign() }}>{busy ? 'Confirmando…' : SIGN}</Button>
          </div>
        </>
      ) : null}
    </section>
  )
}
