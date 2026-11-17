import { useRef } from 'react'
import { formatCount, shortProduct, type JourneyStep } from '../kit'

export type ReceiptItem = { productId: string; productName: string; expected: number }
export type ItemAnswer = { mode: 'yes' | 'other'; quantity: number }
export type LineAnswers = { answers: Record<string, ItemAnswer>; reason: string }

export const EMPTY_ANSWERS: LineAnswers = { answers: {}, reason: '' }

export const ERROR_MESSAGES: Record<string, string> = {
  reason_required: 'Contanos qué pasó: hace falta el motivo cuando llegó menos de lo enviado.',
  reason_not_allowed: 'El motivo solo se completa cuando llegó menos de lo enviado.',
  quantity_exceeds_sent: 'No puede llegar más de lo que se envió.',
  invalid_receipt: 'Lo que cargaste no coincide con el envío. Actualizá la página y probá de nuevo.',
  invalid_quantity: 'Hay una cantidad que no es válida.',
  already_received: 'Este envío ya fue confirmado. Actualizá la página.',
  cabecera_receipt_pending: 'La cabecera todavía no confirmó que le llegó este envío.',
  idempotency_conflict: 'Lo que cargaste cambió respecto del intento anterior. Probá de nuevo.',
  forbidden: 'Esta cuenta no puede confirmar este envío.',
}

const sendable = (items: ReceiptItem[]) => items.filter((item) => item.expected > 0)

/** Everything arrived: every product that was expected is answered "yes". */
export function allArrived(items: ReceiptItem[]): LineAnswers {
  const answers: LineAnswers['answers'] = {}
  for (const item of sendable(items)) answers[item.productId] = { mode: 'yes', quantity: item.expected }
  return { answers, reason: '' }
}

/** Less arrived: quantities open up, keeping what was already typed. */
export function lessArrived(items: ReceiptItem[], state: LineAnswers): LineAnswers {
  const answers: LineAnswers['answers'] = {}
  for (const item of sendable(items)) {
    const current = state.answers[item.productId]
    answers[item.productId] = { mode: 'other', quantity: current?.mode === 'other' ? current.quantity : item.expected }
  }
  return { answers, reason: state.reason }
}

export type ArrivalMode = 'all' | 'less' | null

export function arrivalMode(items: ReceiptItem[], state: LineAnswers): ArrivalMode {
  const expected = sendable(items)
  if (expected.some((item) => state.answers[item.productId]?.mode === 'other')) return 'less'
  if (expected.length > 0 && expected.every((item) => state.answers[item.productId]?.mode === 'yes')) return 'all'
  return null
}

/** "1° grado: 30 · 2° grado: 25" */
export function summarizeItems(items: ReceiptItem[]): string {
  return sendable(items).map((item) => `${shortProduct(item.productName)}: ${formatCount(item.expected)}`).join(' · ')
}

export const pluralize = (count: number, one: string, many: string) => (count === 1 ? one : many)

export type JourneyInput = {
  dispatchedAt: string
  /** A directo envío goes from Planeamiento straight to the school, so its journey has no cabecera step. */
  direct?: boolean
  cabeceraBy: Signer | null
  cabeceraAt: string | null
  cabeceraShort: boolean
  /** Schools of the envío that already confirmed, out of all of them. */
  schools: { confirmed: number; total: number; short: boolean; by?: Signer | null; at?: string | null }
}

const who = (signer: Signer | null, at: string | null) => [signer?.name, formatWhen(at)].filter(Boolean).join(' · ') || null

/** Enviado -> Llegó a la cabecera -> Llegó a la escuela, with who confirmed each step and when. */
export function buildJourney(input: JourneyInput): JourneyStep[] {
  const cabeceraDone = Boolean(input.cabeceraAt || input.cabeceraBy)
  const { confirmed, total, short, by = null, at = null } = input.schools
  const schoolsDone = total > 0 && confirmed >= total
  const schoolDetail = total > 1 ? `${confirmed} de ${total} escuelas` : who(by, at)
  const sent: JourneyStep = { label: 'Enviado', state: 'done', detail: `Planeamiento · ${formatWhen(input.dispatchedAt)}` }
  if (input.direct) {
    return [sent, { label: 'Llegó a la escuela', state: schoolsDone ? (short ? 'short' : 'done') : 'current', detail: schoolDetail }]
  }
  return [
    sent,
    { label: 'Llegó a la cabecera', state: cabeceraDone ? (input.cabeceraShort ? 'short' : 'done') : 'current', detail: who(input.cabeceraBy, input.cabeceraAt) },
    {
      label: 'Llegó a la escuela',
      state: schoolsDone ? (short ? 'short' : 'done') : cabeceraDone ? 'current' : 'pending',
      detail: schoolDetail,
    },
  ]
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
  return ERROR_MESSAGES[code] ?? 'No se pudo confirmar. Probá de nuevo.'
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
