'use client'

import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Note, formatCount } from '../kit'
import { formatWhen, type Signer } from './receipt-model'

type SignPanelProps = {
  /** Action shown before the confirm button, e.g. the cabecera's "Sí, llegó todo". */
  before?: ReactNode
  receivedTotal: number
  expectedTotal: number
  /** Totals only make sense once every product is answered. */
  answered: boolean
  canSign: boolean
  busy: boolean
  error: string | null
  hint?: string
  onSign: () => void
}

/** What arrived in total plus the button that confirms it. */
export function SignPanel({ receivedTotal, expectedTotal, answered, canSign, busy, error, hint, onSign, before }: SignPanelProps) {
  return (
    <div className="k-stack" style={{ gap: '.5rem' }}>
      {answered ? (
        <p className="k-total" style={{ margin: 0 }}>
          <span>{receivedTotal < expectedTotal ? `Llegaron ${formatCount(receivedTotal)} de ${formatCount(expectedTotal)} cuadernillos` : `Llegaron los ${formatCount(expectedTotal)} cuadernillos`}</span>
        </p>
      ) : null}
      {hint ? <p className="k-hint" style={{ margin: 0 }}>{hint}</p> : null}
      {error ? <Note tone="danger">{error}</Note> : null}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem' }}>
        {before}
        <Button type="button" style={{ minHeight: '2.5rem' }} disabled={!canSign || busy} onClick={onSign}>{busy ? 'Confirmando…' : 'Confirmo que recibí estos cuadernillos'}</Button>
      </div>
    </div>
  )
}

/** Confirmed envíos are read-only: who confirmed and when. */
export function SignedNote({ signer, at }: { signer: Signer | null; at: string | null }) {
  return <Note tone="ok">{`Confirmado por ${signer?.name ?? 'cuenta no disponible'}${at ? ` · ${formatWhen(at)}` : ''}`}</Note>
}
