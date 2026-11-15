import { shortProduct } from '../kit'

export type ProductOption = { productId: string; productLabel: string; available: number }

export type RemitoSigner = { userId: string; name: string }

export type RemitoItemRow = {
  productId: string
  productName?: string
  dispatchedQuantity: number
  cabeceraReceivedQuantity: number | null
  schoolReceivedQuantity: number | null
}

export type RemitoLineRow = {
  recipientCueAnexo: string
  recipientName: string | null
  status: 'in_transit' | 'at_cabecera' | 'received' | 'closed_empty'
  cabeceraShortfallReason?: string | null
  schoolShortfallReason?: string | null
  schoolReceivedBy?: RemitoSigner | null
  schoolReceivedAt?: string | null
  items: RemitoItemRow[]
}

export type RemitoSummary = {
  remitoId: string
  campaignId: string
  cabeceraCueAnexo: string
  status: 'dispatched' | 'received'
  dispatchedAt: string
  cabeceraReceivedAt: string | null
  cabeceraReceivedBy?: RemitoSigner | null
  lines: RemitoLineRow[]
}

export type RemitosPage = { remitos: RemitoSummary[]; hasMore: boolean; nextCursor: string | null }

export type ConfirmedCabecera = { cue: string; nombre: string; departamento: string }

export function isRemitosPage(value: unknown): value is RemitosPage {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return Array.isArray(row.remitos) && typeof row.hasMore === 'boolean'
    && (row.nextCursor === null || typeof row.nextCursor === 'string')
}

export function isCabeceraList(value: unknown): value is { cabeceras: Array<ConfirmedCabecera & { status: string }> } {
  return Boolean(value && typeof value === 'object' && Array.isArray((value as { cabeceras?: unknown }).cabeceras))
}

/** Error codes from the API mapped to plain Spanish; the codes are only keys and never reach the screen. */
export const REMITO_ERRORS: Record<string, string> = {
  forbidden: 'Tu cuenta no tiene permiso para enviar cuadernillos.',
  campaign_inactive: 'La campaña ya no está activa.',
  policy_unresolved: 'La campaña todavía no tiene habilitada la distribución.',
  authority_unavailable: 'La escuela cabecera todavía no confirmó su cuenta para recibir envíos. Pedile que la confirme y volvé a intentar.',
  product_not_found: 'Uno de los cuadernillos del envío ya no está disponible.',
  idempotency_conflict: 'Este reintento no coincide con el envío anterior. Cerrá esta ventana y volvé a armar el envío.',
  duplicate_recipient: 'Hay una escuela repetida en el envío.',
  invalid_quantity: 'Revisá las cantidades: tienen que ser números enteros positivos.',
  invalid_remito: 'El envío necesita al menos una escuela con cantidades.',
}

const GENERIC_ERROR = 'No se pudo enviar. Intentá nuevamente.'

function schoolPhrase(name: string) {
  return /^escuela\b/i.test(name) ? name : `escuela ${name}`
}

/**
 * Plain message for a failed dispatch. `labels` resolves product ids, `schools` resolves CUEs to names
 * and `available` (optional) gives the remaining stock per product id.
 */
export function dispatchErrorMessage(
  data: unknown,
  labels: Map<string, string>,
  schools: Map<string, string>,
  available?: Map<string, number>,
): string {
  const body = data && typeof data === 'object' ? data as Record<string, unknown> : {}
  const code = typeof body.error === 'string' ? body.error : ''
  if (code === 'recipients_not_critical' && Array.isArray(body.recipientCueAnexos)) {
    const names = body.recipientCueAnexos.map(String).map((cue) => {
      const name = schools.get(cue)
      return name ? schoolPhrase(name) : `escuela con CUE ${cue}`
    })
    if (names.length === 1) return `La ${names[0]} ya no figura como prioritaria, quitala del envío.`
    return `Estas escuelas ya no figuran como prioritarias, quitalas del envío: ${names.join(', ')}.`
  }
  if (code === 'insufficient_stock' && Array.isArray(body.productIds)) {
    const parts = body.productIds.map(String).map((id) => ({ name: shortProduct(labels.get(id) ?? id), left: available?.get(id) }))
    if (parts.length === 1) {
      const [part] = parts
      return part.left === undefined
        ? `No alcanza el stock de ${part.name}.`
        : `No alcanza el stock de ${part.name}: quedan ${part.left}.`
    }
    return `No alcanza el stock de ${parts.map((part) => (part.left === undefined ? part.name : `${part.name} (quedan ${part.left})`)).join(', ')}.`
  }
  return REMITO_ERRORS[code] ?? GENERIC_ERROR
}
