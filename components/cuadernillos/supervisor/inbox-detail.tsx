'use client'

import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import type { BookletRequestSummary } from '@/lib/cuadernillos/types'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { type ProductAvailability, defaultApprovalQuantities, fichaEscuelaHref, formatCue } from './inbox-model'

export type ApprovalLine = { productId: string; quantity: number }

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

  const blocked = busy
  const shownError = localError ?? error

  return (
    <div style={{ display: 'grid', gap: '1.25rem', alignContent: 'start' }}>
      <header style={{ display: 'grid', gap: '.35rem' }}>
        {/* Plain element styled as a title: the global heading style uppercases school names. */}
        <p style={{ margin: 0, color: 'var(--ink)', fontFamily: 'var(--font-display)', fontSize: '1.35rem', fontWeight: 700, textTransform: 'none', overflowWrap: 'anywhere' }}>
          {request.recipientName || 'Escuela destinataria'}
        </p>
        <p style={{ margin: 0, color: 'var(--ink-soft)' }}>
          CUE {formatCue(request.recipientCueAnexo)} · Cabecera {request.cabeceraName}
        </p>
        {ficha ? (
          <a href={ficha} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem', justifySelf: 'start' }}>
            Ver ficha <ExternalLink aria-hidden size={14} />
          </a>
        ) : null}
      </header>

      <div style={{ overflowX: 'auto' }}>
        <table aria-label="Cantidades solicitadas" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <caption style={{ captionSide: 'top', textAlign: 'left', padding: '0 0 .5rem', color: 'var(--ink-soft)' }}>
            Total solicitado: {totalRequested}
          </caption>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--line)' }}>
              <th scope="col" style={{ textAlign: 'left', padding: '.4rem .3rem', color: 'var(--ink-soft)', fontWeight: 600 }}>Producto</th>
              <th scope="col" style={{ textAlign: 'right', padding: '.4rem .3rem', color: 'var(--ink-soft)', fontWeight: 600 }}>Solicitado</th>
              <th scope="col" style={{ textAlign: 'right', padding: '.4rem .3rem', color: 'var(--ink-soft)', fontWeight: 600 }}>Disponible</th>
              <th scope="col" style={{ textAlign: 'left', padding: '.4rem .3rem', color: 'var(--ink-soft)', fontWeight: 600 }}>Aprobar</th>
            </tr>
          </thead>
          <tbody>
            {request.requested.map((line) => {
              const known = availability.find((row) => row.productId === line.productId)
              return (
                <tr key={line.productId} style={{ borderBottom: '1px solid var(--line)' }}>
                  <td style={{ padding: '.6rem .3rem', color: 'var(--ink)', overflowWrap: 'anywhere' }}>{line.productLabel}</td>
                  <td style={{ padding: '.6rem .3rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{line.quantity}</td>
                  <td style={{ padding: '.6rem .3rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{known ? known.available : '—'}</td>
                  <td style={{ padding: '.4rem .3rem' }}>
                    <input
                      id={`approved-${line.productId}`}
                      aria-label={`Cantidad aprobada · ${line.productLabel}`}
                      type="number" inputMode="numeric" min={0} max={line.quantity} step={1}
                      disabled={blocked}
                      value={values[line.productId] ?? String(defaults[line.productId] ?? line.quantity)}
                      onChange={(event) => setValues((current) => ({ ...current, [line.productId]: event.target.value }))}
                      style={{ width: '5rem', minWidth: 0, boxSizing: 'border-box', padding: '.45rem .5rem', border: '1px solid var(--line)', borderRadius: '.5rem', background: 'var(--surface)', color: 'var(--ink)' }}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

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

      <footer style={{ position: 'sticky', bottom: 0, display: 'grid', gap: '.6rem', paddingTop: '.9rem', background: 'var(--surface)', borderTop: '1px solid var(--line)' }}>
        <p style={{ margin: 0, color: 'var(--ink-soft)', fontSize: '.9rem' }}>
          La aprobación descuenta stock y cupo y no se puede anular.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem' }}>
          <Button type="button" onClick={openApproval} disabled={blocked}>Aprobar</Button>
          <Button type="button" variant="secondary" onClick={() => setRejectOpen((open) => !open)} disabled={blocked} aria-expanded={rejectOpen}>Rechazar</Button>
        </div>
      </footer>

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
