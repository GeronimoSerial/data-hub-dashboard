'use client'

import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import type { BookletRequestSummary } from '@/lib/cuadernillos/types'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ModalBody, ModalFoot, Note, Stepper } from '../kit'
import { type ProductAvailability, defaultApprovalQuantities, fichaEscuelaHref, formatCue } from './inbox-model'

export type ApprovalLine = { productId: string; quantity: number }

type Step = 'review' | 'confirm' | 'reject'

/** Body and footer of the decision modal; the modal chrome belongs to the caller. */
export function InboxDetail({
  request, availability, busy, error, onApprove, onReject,
}: {
  request: BookletRequestSummary
  availability: ProductAvailability[]
  busy: boolean
  error: string | null
  onApprove: (lines: ApprovalLine[]) => void
  onReject: (reason: string) => void
}) {
  const defaults = defaultApprovalQuantities(request, availability)
  const [values, setValues] = useState<Record<string, number>>({})
  const [step, setStep] = useState<Step>('review')
  const [reason, setReason] = useState('')
  const ficha = fichaEscuelaHref(request.recipientCueAnexo)
  const quantityOf = (productId: string, requested: number) => values[productId] ?? defaults[productId] ?? requested
  const lines: ApprovalLine[] = request.requested.flatMap((line) => {
    const quantity = quantityOf(line.productId, line.quantity)
    return quantity > 0 ? [{ productId: line.productId, quantity }] : []
  })
  const totalRequested = request.requested.reduce((sum, line) => sum + line.quantity, 0)
  const totalApproved = lines.reduce((sum, line) => sum + line.quantity, 0)

  const footer = step === 'confirm' ? (
    <>
      <p style={{ flex: '1 1 100%', margin: 0, color: 'var(--ink-soft)', fontSize: '.9rem' }}>
        Se aprobarán {totalApproved} cuadernillos. La aprobación descuenta stock y cupo y no se puede anular.
      </p>
      <Button type="button" variant="secondary" disabled={busy} onClick={() => setStep('review')}>Volver</Button>
      <Button type="button" disabled={busy} onClick={() => onApprove(lines)}>{busy ? 'Aprobando…' : 'Confirmar aprobación'}</Button>
    </>
  ) : step === 'reject' ? (
    <>
      <Button type="button" variant="secondary" disabled={busy} onClick={() => setStep('review')}>Volver</Button>
      <Button type="button" variant="destructive" disabled={busy || !reason.trim()} onClick={() => onReject(reason.trim())}>
        {busy ? 'Rechazando…' : 'Rechazar solicitud'}
      </Button>
    </>
  ) : (
    <>
      <Button type="button" variant="secondary" disabled={busy} onClick={() => setStep('reject')}>Rechazar</Button>
      <Button type="button" disabled={busy || lines.length === 0} onClick={() => setStep('confirm')}>Aprobar</Button>
    </>
  )
  return (
    <>
      <ModalBody>
      <p style={{ margin: 0, color: 'var(--ink-soft)' }}>
        CUE {formatCue(request.recipientCueAnexo)} · Cabecera {request.cabeceraName}
        {ficha ? (
          <>
            {' · '}
            <a className="k-link" href={ficha} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '.25rem' }}>
              Ver ficha <ExternalLink aria-hidden size={14} />
            </a>
          </>
        ) : null}
      </p>

      {step === 'reject' ? (
        <div className="k-field">
          <label htmlFor="reject-reason">Motivo del rechazo</label>
          <Textarea id="reject-reason" value={reason} maxLength={1000} disabled={busy} onChange={(event) => setReason(event.target.value)} />
          <span className="k-hint">La cabecera ve este motivo en su pedido.</span>
        </div>
      ) : (
        <>
          <ul className="k-qty-list" aria-label="Cantidades solicitadas">
            {request.requested.map((line) => {
              const known = availability.find((row) => row.productId === line.productId)
              const short = known !== undefined && known.available < line.quantity
              return (
                <li key={line.productId} className="k-qty-row">
                  <div className="k-row-main">
                    <span className="k-row-title">{line.productLabel}</span>
                    <span className="k-row-meta">
                      Pidió {line.quantity} · Disponible {known ? known.available : '—'}{short ? ' · alcanza menos' : ''}
                    </span>
                  </div>
                  <Stepper
                    label={`Cantidad aprobada · ${line.productLabel}`}
                    value={quantityOf(line.productId, line.quantity)}
                    max={line.quantity}
                    disabled={busy || step === 'confirm'}
                    onChange={(next) => setValues((current) => ({ ...current, [line.productId]: next }))}
                  />
                </li>
              )
            })}
          </ul>
          <div className="k-total">
            <span>A aprobar de {totalRequested} solicitados</span>
            <strong>{totalApproved}</strong>
          </div>
          {lines.length === 0 ? <Note>Ingresá al menos una cantidad mayor que cero, o rechazá la solicitud.</Note> : null}
        </>
      )}

      {error ? <Note tone="danger">{error}</Note> : null}
      </ModalBody>
      <ModalFoot>{footer}</ModalFoot>
    </>
  )
}
