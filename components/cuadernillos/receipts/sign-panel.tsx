'use client'

import { Button } from '@/components/ui/button'
import { Note, formatCount } from '../kit'
import { formatWhen, type Signer } from './receipt-model'

type SignPanelProps = {
  receivedTotal: number
  expectedTotal: number
  canSign: boolean
  busy: boolean
  error: string | null
  hint?: string
  onSign: () => void
}

/** Summary of the answers plus the button that signs them. */
export function SignPanel({ receivedTotal, expectedTotal, canSign, busy, error, hint, onSign }: SignPanelProps) {
  const missing = expectedTotal - receivedTotal
  return (
    <div className="k-stack" style={{ gap: '.5rem' }}>
      <p className="k-total" style={{ margin: 0 }}>
        <span>{missing > 0 ? `Recibís ${formatCount(receivedTotal)} de ${formatCount(expectedTotal)} cuadernillos (faltan ${formatCount(missing)})` : `Recibís los ${formatCount(expectedTotal)} cuadernillos`}</span>
      </p>
      {hint ? <p className="k-hint" style={{ margin: 0 }}>{hint}</p> : null}
      {error ? <Note tone="danger">{error}</Note> : null}
      <Button type="button" disabled={!canSign || busy} onClick={onSign}>{busy ? 'Firmando…' : 'Firmar recibido'}</Button>
    </div>
  )
}

/** Signed receipts are read-only: who signed and when. */
export function SignedNote({ signer, at }: { signer: Signer | null; at: string | null }) {
  return <Note tone="ok">{`Firmado por ${signer?.name ?? 'cuenta no disponible'}${at ? ` · ${formatWhen(at)}` : ''}`}</Note>
}
