'use client'

import { useState } from 'react'
import type { BookletRequestSummary } from '@/lib/cuadernillos/types'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { type ProductAvailability, defaultApprovalQuantities, fichaEscuelaHref, formatCue } from './inbox-model'

export type ApprovalLine = { productId: string; quantity: number }

export function InboxDetail({
  request, availability, readOnly, busy, error, showTitle = true, onApprove, onReject,
}: {
  request: BookletRequestSummary
  availability: ProductAvailability[]
  readOnly: boolean
  busy: boolean
  error: string | null
  // The bottom sheet on phones already carries the school name as its title.
  showTitle?: boolean
  onApprove: (lines: ApprovalLine[]) => void
  onReject: (reason: string) => void
}) {
  const defaults = defaultApprovalQuantities(request, availability)
  const [values, setValues] = useState<Record<string, string>>({})
  const [localError, setLocalError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState('')
  const ficha = fichaEscuelaHref(request.recipientCueAnexo)
  const totalRequested = request.requested.reduce((sum, line) => sum + line.quantity, 0)

  function collectLines(): ApprovalLine[] | null {
    const lines: ApprovalLine[] = []
    for (const line of request.requested) {
      const raw = (values[line.productId] ?? String(defaults[line.productId] ?? line.quantity)).trim()
      const quantity = Number(raw)
      if (raw === '' || !Number.isSafeInteger(quantity) || quantity < 0 || quantity > line.quantity) {
        setLocalError('Cada cantidad aprobada debe ser un número entero entre 0 y lo solicitado.')
        return null
      }
      if (quantity > 0) lines.push({ productId: line.productId, quantity })
    }
    if (!lines.length) {
      setLocalError('Ingresá al menos una cantidad mayor que cero, o rechazá la solicitud.')
      return null
    }
    return lines
  }

  function openApproval() {
    setLocalError(null)
    if (collectLines()) setConfirmOpen(true)
  }

  function confirmApproval() {
    const lines = collectLines()
    setConfirmOpen(false)
    if (lines) onApprove(lines)
  }

  const blocked = readOnly || busy
  const shownError = localError ?? error

  return (
    <div style={{ display: 'grid', gap: '1.25rem', alignContent: 'start' }}>
      <header style={{ display: 'grid', gap: '.35rem' }}>
        {showTitle ? (
          <SheetTitle style={{ margin: 0, color: 'var(--ink)', fontFamily: 'var(--font-display)', fontSize: '1.35rem', overflowWrap: 'anywhere' }}>
            {request.recipientName || 'Escuela destinataria'}
          </SheetTitle>
        ) : null}
        <p style={{ margin: 0, color: 'var(--ink-soft)' }}>CUE {formatCue(request.recipientCueAnexo)}</p>
        <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Cabecera: {request.cabeceraName}</p>
        {ficha ? (
          <a href={ficha} target="_blank" rel="noopener noreferrer" style={{ justifySelf: 'start' }}>Ver ficha</a>
        ) : null}
      </header>

      <section style={{ display: 'grid', gap: '.75rem' }} aria-label="Cantidades">
        <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Total solicitado: {totalRequested}</p>
        {request.requested.map((line) => {
          const known = availability.find((row) => row.productId === line.productId)
          return (
            <div key={line.productId} style={{ display: 'grid', gap: '.3rem' }}>
              <label htmlFor={`approved-${line.productId}`} style={{ fontWeight: 600, color: 'var(--ink)' }}>
                Cantidad aprobada · {line.productLabel}
              </label>
              <input
                id={`approved-${line.productId}`}
                type="number" inputMode="numeric" min={0} max={line.quantity} step={1}
                disabled={blocked}
                value={values[line.productId] ?? String(defaults[line.productId] ?? line.quantity)}
                onChange={(event) => setValues((current) => ({ ...current, [line.productId]: event.target.value }))}
                style={{ maxWidth: '10rem', minWidth: 0, width: '100%', boxSizing: 'border-box', padding: '.5rem .6rem', border: '1px solid var(--line)', borderRadius: '.5rem', background: 'var(--surface)', color: 'var(--ink)' }}
              />
              <span style={{ color: 'var(--ink-soft)', fontSize: '.9rem' }}>
                Solicitado: {line.quantity}
                {known ? ` · Disponible: ${known.available}` : ' · Disponibilidad no informada'}
              </span>
            </div>
          )
        })}
      </section>

      {readOnly ? (
        <p style={{ margin: 0, padding: '.75rem 1rem', background: 'var(--fill)', color: 'var(--ink-soft)', borderRadius: '.5rem' }}>
          Solo lectura: mientras ve la cuenta de otro usuario no se pueden registrar decisiones.
        </p>
      ) : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem' }}>
        <Button type="button" onClick={openApproval} disabled={blocked}>Aprobar</Button>
        <Button type="button" variant="secondary" onClick={() => setRejectOpen((open) => !open)} disabled={blocked} aria-expanded={rejectOpen}>Rechazar</Button>
      </div>
      <p style={{ margin: 0, color: 'var(--ink-soft)', fontSize: '.9rem' }}>
        La aprobación descuenta stock y cupo de inmediato y no puede anularse.
      </p>

      {rejectOpen ? (
        <div style={{ display: 'grid', gap: '.5rem' }}>
          <label htmlFor="reject-reason" style={{ fontWeight: 600, color: 'var(--ink)' }}>Motivo del rechazo</label>
          <Textarea id="reject-reason" value={reason} maxLength={1000} disabled={blocked}
            onChange={(event) => setReason(event.target.value)} />
          <Button type="button" variant="destructive" disabled={blocked || !reason.trim()} onClick={() => onReject(reason.trim())}>
            Rechazar solicitud
          </Button>
        </div>
      ) : null}

      {shownError ? <p role="alert" style={{ margin: 0, color: 'var(--danger-ink)' }}>{shownError}</p> : null}

      <ConfirmSheet
        open={confirmOpen}
        titulo="¿Aprobar este pedido?"
        confirmarLabel="Confirmar aprobación"
        onConfirmar={confirmApproval}
        onCancelar={() => setConfirmOpen(false)}
      >
        <p style={{ margin: 0 }}>Se aprobarán las cantidades indicadas. Esta decisión descuenta stock y cupo y no puede anularse.</p>
      </ConfirmSheet>
    </div>
  )
}
