import { shortProduct } from '../kit'
import { errorCode, loadJson, isOverview, readJson } from './cabecera-api'

export const RESERVE_LABEL = 'Reserva para repartir'

export type ReserveBalance = { productId: string; productName: string; received: number; assigned: number; available: number }
export type ReserveAssignment = {
  remitoId: string
  recipientCueAnexo: string
  recipientName: string
  dispatchedAt: string
  status: string
  items: Array<{ productId: string; productName: string; quantity: number }>
}
export type ReserveView = { campaignId: string; cabeceraCueAnexo: string; balances: ReserveBalance[]; assignments: ReserveAssignment[] }

const isRow = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object')

function isBalance(value: unknown): value is ReserveBalance {
  return isRow(value) && typeof value.productId === 'string' && typeof value.productName === 'string'
    && Number.isSafeInteger(value.received) && Number.isSafeInteger(value.assigned) && Number.isSafeInteger(value.available)
}

function isAssignment(value: unknown): value is ReserveAssignment {
  return isRow(value) && typeof value.remitoId === 'string' && typeof value.recipientName === 'string'
    && typeof value.recipientCueAnexo === 'string' && typeof value.dispatchedAt === 'string' && typeof value.status === 'string'
    && Array.isArray(value.items)
}

export function isReserveView(value: unknown): value is ReserveView {
  return isRow(value) && typeof value.campaignId === 'string'
    && Array.isArray(value.balances) && value.balances.every(isBalance)
    && Array.isArray(value.assignments) && value.assignments.every(isAssignment)
}

const LOAD_FAILURE = 'No se pudo cargar lo que tenés para repartir.'

/** The campaign comes from the cabecera overview; the reserve is then read for that campaign. `null` means no campaign could be resolved, so there is nothing to show. */
export async function loadReserve(signal: { cancelled: boolean }, cancels: Array<() => void>): Promise<ReserveView | null> {
  const overviewLoad = loadJson('/api/cuadernillos/overview?capability=cabecera', isOverview, LOAD_FAILURE)
  cancels.push(overviewLoad.cancel)
  const overview = await overviewLoad.promise.catch(() => null)
  if (signal.cancelled || !overview?.campaignId) return null
  const reserveLoad = loadJson(`/api/cuadernillos/reserva?campaignId=${encodeURIComponent(overview.campaignId)}`, isReserveView, LOAD_FAILURE)
  cancels.push(reserveLoad.cancel)
  return reserveLoad.promise
}

export type AssignmentRequest = {
  campaignId: string
  recipientCueAnexo: string
  items: Array<{ productId: string; quantity: number }>
}

export function assignmentBody(request: AssignmentRequest, idempotencyKey: string) {
  return { campaignId: request.campaignId, recipientCueAnexo: request.recipientCueAnexo, items: request.items, idempotencyKey }
}

export type AssignmentResult = { ok: true; recipientName: string } | { ok: false; message: string }

const ERRORS: Record<string, string> = {
  recipients_not_critical: 'Esa escuela ya no figura como prioritaria. Volvé atrás y elegí otra.',
  forbidden: 'Tu cuenta no puede repartir cuadernillos de esta cabecera.',
  campaign_inactive: 'La campaña ya no está activa.',
  policy_unresolved: 'La campaña todavía no tiene habilitada la distribución.',
  idempotency_conflict: 'Este reintento no coincide con el anterior. Cerrá esta ventana y volvé a armar la asignación.',
  invalid_quantity: 'Revisá las cantidades: tienen que ser números enteros positivos.',
}
const NETWORK = 'No se pudo asignar. Revisá la conexión y probá de nuevo.'
const GENERIC = 'No se pudo asignar. Probá de nuevo.'

function reserveShortMessage(data: unknown, labels: Map<string, string>) {
  const details = isRow(data) && isRow(data.details) ? data.details : {}
  const ids = Array.isArray(details.productIds) ? details.productIds.map(String) : []
  if (ids.length === 0) return 'Ya no queda esa cantidad para repartir. Bajá las cantidades y probá de nuevo.'
  return `Ya no queda esa cantidad de ${ids.map((id) => shortProduct(labels.get(id) ?? id)).join(', ')}. Bajá las cantidades y probá de nuevo.`
}

/** POSTs one assignment; every failure comes back as a plain Spanish message, never an API code. */
export async function postAssignment(body: object, labels: Map<string, string>): Promise<AssignmentResult> {
  try {
    const response = await fetch('/api/cuadernillos/reserva/asignaciones', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const data = await readJson(response)
    if (response.ok) return { ok: true, recipientName: isRow(data) && typeof data.recipientName === 'string' ? data.recipientName : '' }
    const code = errorCode(data)
    if (code === 'insufficient_reserve') return { ok: false, message: reserveShortMessage(data, labels) }
    return { ok: false, message: ERRORS[code] ?? GENERIC }
  } catch {
    return { ok: false, message: NETWORK }
  }
}

const ASSIGNMENT_STATUS: Record<string, string> = { received: 'La escuela lo recibió', closed_empty: 'Cerrado', in_transit: 'En camino a la escuela' }
export const assignmentStatus = (status: string) => ASSIGNMENT_STATUS[status] ?? ASSIGNMENT_STATUS.in_transit
