import { useRef } from 'react'

export type ReceiptItem = { productId: string; productName: string; expected: number }
export type ItemAnswer = { mode: 'yes' | 'other'; quantity: number }
export type LineAnswers = { answers: Record<string, ItemAnswer>; reason: string }

export const EMPTY_ANSWERS: LineAnswers = { answers: {}, reason: '' }

export const ERROR_MESSAGES: Record<string, string> = {
  reason_required: 'Indicá el motivo de la diferencia en cada línea con faltante.',
  reason_not_allowed: 'Solo se indica un motivo cuando hay faltante.',
  quantity_exceeds_sent: 'No podés recibir más de lo que se envió.',
  invalid_receipt: 'El recibido no coincide con el envío. Actualizá la página y volvé a intentar.',
  invalid_quantity: 'Hay una cantidad inválida.',
  already_received: 'Este envío ya fue firmado. Actualizá la página.',
  cabecera_receipt_pending: 'La cabecera todavía no firmó el recibido de este envío.',
  idempotency_conflict: 'El reintento no coincide con la firma anterior. Volvé a intentar.',
  forbidden: 'Esta cuenta no puede firmar este recibido.',
}

/** Quantity the item resolves to: an item with nothing expected needs no answer. */
function resolved(item: ReceiptItem, answer: ItemAnswer | undefined): number | null {
  if (item.expected === 0) return 0
  if (!answer) return null
  if (answer.mode === 'yes') return item.expected
  const { quantity } = answer
  return Number.isSafeInteger(quantity) && quantity >= 0 && quantity <= item.expected ? quantity : null
}

export type LineEvaluation = {
  complete: boolean
  shortfall: boolean
  reasonMissing: boolean
  expectedTotal: number
  receivedTotal: number
  items: Array<{ productId: string; receivedQuantity: number }>
}

export function evaluateLine(items: ReceiptItem[], state: LineAnswers): LineEvaluation {
  let complete = true
  let shortfall = false
  let expectedTotal = 0
  let receivedTotal = 0
  const payload: LineEvaluation['items'] = []
  for (const item of items) {
    const quantity = resolved(item, state.answers[item.productId])
    expectedTotal += item.expected
    if (quantity === null) { complete = false; continue }
    receivedTotal += quantity
    if (quantity < item.expected) shortfall = true
    payload.push({ productId: item.productId, receivedQuantity: quantity })
  }
  return { complete, shortfall, reasonMissing: shortfall && !state.reason.trim(), expectedTotal, receivedTotal, items: payload }
}

/** Reason only travels with a real shortfall; the API rejects one without it. */
export function reasonFor(evaluation: LineEvaluation, state: LineAnswers): string | undefined {
  return evaluation.shortfall ? state.reason.trim() : undefined
}

export type PostResult = { ok: true; data: unknown } | { ok: false; code: string }

export async function postReceipt(url: string, body: unknown): Promise<PostResult> {
  try {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data: unknown = await response.json().catch(() => null)
    if (response.ok) return { ok: true, data }
    const code = data && typeof data === 'object' && 'error' in data && typeof (data as { error: unknown }).error === 'string' ? (data as { error: string }).error : ''
    return { ok: false, code }
  } catch {
    return { ok: false, code: 'network' }
  }
}

export function errorMessage(code: string): string {
  return ERROR_MESSAGES[code] ?? 'No se pudo firmar el recibido. Volvé a intentar.'
}

/** One key per distinct payload: a retry of the same payload replays, an edited payload gets a fresh key. */
export function useIdempotencyKey() {
  const ref = useRef<{ fingerprint: string; key: string } | null>(null)
  return (fingerprint: string) => {
    if (!ref.current || ref.current.fingerprint !== fingerprint) ref.current = { fingerprint, key: crypto.randomUUID() }
    return ref.current.key
  }
}

export function formatWhen(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
}

export type Signer = { userId: string; name: string }
export function isSigner(value: unknown): value is Signer {
  return Boolean(value && typeof value === 'object' && typeof (value as Signer).userId === 'string' && typeof (value as Signer).name === 'string')
}
