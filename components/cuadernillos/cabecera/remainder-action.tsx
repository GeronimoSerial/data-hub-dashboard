'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Note, Stepper } from '../kit'
import type { BookletRequestSummary, QuantityLine, RequestChainView } from '@/lib/cuadernillos/types'
import { REMAINDER_ERRORS, errorCode, readJson } from './cabecera-api'

function isChain(value: unknown): value is RequestChainView {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return typeof row.rootRequestId === 'string' && Array.isArray(row.availableRemainder)
}

/** Remainder for a partially approved request: check availability, then ask for the open quantities. */
export function RemainderAction({ request, onRequested }: {
  request: BookletRequestSummary
  onRequested: (message: string) => void
}) {
  const [available, setAvailable] = useState<QuantityLine[] | null>(null)
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState<'check' | 'submit' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const intent = useRef<{ body: string; key: string } | null>(null)

  const labelOf = (productId: string) => request.requested.find((line) => line.productId === productId)?.productLabel ?? productId

  async function check() {
    setBusy('check')
    setError(null)
    try {
      const response = await fetch(`/api/cuadernillos/requests/${encodeURIComponent(request.requestId)}/remainder`, { cache: 'no-store' })
      const data = await readJson(response)
      if (!response.ok) throw new Error(REMAINDER_ERRORS[errorCode(data)] ?? 'No se pudo verificar el remanente de este pedido.')
      if (!isChain(data) || data.rootRequestId !== request.rootRequestId) throw new Error('La respuesta del remanente no tiene un formato válido.')
      setAvailable(data.availableRemainder)
      setQuantities(Object.fromEntries(data.availableRemainder.map((line) => [line.productId, line.quantity])))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo verificar el remanente de este pedido.')
    } finally {
      setBusy(null)
    }
  }

  async function submit() {
    const lines = (available ?? []).flatMap((line) => {
      const quantity = quantities[line.productId] ?? line.quantity
      return Number.isSafeInteger(quantity) && quantity > 0 && quantity <= line.quantity ? [{ productId: line.productId, quantity }] : []
    })
    if (!lines.length) { setError('Indicá al menos una cantidad entera positiva dentro del remanente disponible.'); return }
    const fingerprint = JSON.stringify({ lines })
    if (intent.current?.body !== fingerprint) intent.current = { body: fingerprint, key: crypto.randomUUID() }
    setBusy('submit')
    setError(null)
    try {
      const response = await fetch(`/api/cuadernillos/requests/${encodeURIComponent(request.rootRequestId)}/remainder`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines, idempotencyKey: intent.current.key }),
      })
      const data = await readJson(response)
      if (!response.ok) throw new Error(REMAINDER_ERRORS[errorCode(data)] ?? 'No se pudo solicitar el remanente. El pedido conserva su estado.')
      intent.current = null
      onRequested(`Remanente solicitado para ${request.recipientName}. Aparece en Mis pedidos.`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo solicitar el remanente.')
    } finally {
      setBusy(null)
    }
  }

  if (available === null) {
    return (
      <div style={{ display: 'grid', gap: '.5rem' }}>
        <Button type="button" variant="secondary" disabled={busy !== null} onClick={() => void check()}>
          {busy === 'check' ? 'Consultando…' : 'Pedir remanente'}
        </Button>
        {error ? <Note tone="danger">{error}</Note> : null}
      </div>
    )
  }

  if (available.length === 0) {
    return <Note>No hay cantidades disponibles para pedir como remanente.</Note>
  }

  return (
    <div style={{ display: 'grid', gap: '.75rem' }}>
      <ul className="k-qty-list" aria-label="Remanente disponible">
        {available.map((line) => (
          <li key={line.productId} className="k-qty-row">
            <div className="k-row-main">
              <span className="k-row-title">Remanente · {labelOf(line.productId)}</span>
              <span className="k-row-meta">Disponible: {line.quantity}</span>
            </div>
            <Stepper
              label={`Remanente · ${labelOf(line.productId)}`}
              value={quantities[line.productId] ?? line.quantity}
              max={line.quantity}
              disabled={busy !== null}
              onChange={(next) => setQuantities((current) => ({ ...current, [line.productId]: next }))}
            />
          </li>
        ))}
      </ul>
      {error ? <Note tone="danger">{error}</Note> : null}
      <Button type="button" variant="default" disabled={busy !== null} onClick={() => void submit()}>
        {busy === 'submit' ? 'Enviando…' : 'Solicitar remanente'}
      </Button>
    </div>
  )
}
