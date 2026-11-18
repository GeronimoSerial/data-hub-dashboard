'use client'

import { Note } from '../kit'
import { formatWhen, type Signer } from './receipt-model'

/** Confirmed envíos are read-only: who confirmed and when. */
export function SignedNote({ signer, at }: { signer: Signer | null; at: string | null }) {
  return <Note tone="ok">{`Confirmado por ${signer?.name ?? 'cuenta no disponible'}${at ? ` · ${formatWhen(at)}` : ''}`}</Note>
}
