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

export const REMITO_ERRORS: Record<string, string> = {
  forbidden: 'La cuenta no tiene autorización para despachar remitos.',
  campaign_inactive: 'La campaña ya no está activa.',
  policy_unresolved: 'La campaña no tiene una política de distribución habilitada.',
  authority_unavailable: 'Esa cabecera todavía no tiene una cuenta confirmada para recibir el remito.',
  product_not_found: 'Un cuadernillo del remito ya no está disponible en el catálogo.',
  idempotency_conflict: 'El reintento no coincide con el remito anterior. Cerrá esta ventana y volvé a armar el remito.',
  duplicate_recipient: 'Hay una escuela repetida en el remito.',
  invalid_quantity: 'Revisá las cantidades: tienen que ser números enteros positivos.',
  invalid_remito: 'El remito necesita al menos una escuela con cantidades.',
}

/** Human message for a failed dispatch. `labels` resolves product ids; `schools` resolves CUEs to names. */
export function dispatchErrorMessage(data: unknown, labels: Map<string, string>, schools: Map<string, string>): string {
  const body = data && typeof data === 'object' ? data as Record<string, unknown> : {}
  const code = typeof body.error === 'string' ? body.error : ''
  if (code === 'recipients_not_critical' && Array.isArray(body.recipientCueAnexos)) {
    const list = body.recipientCueAnexos.map(String).map((cue) => schools.get(cue) ? `${schools.get(cue)} (CUE ${cue})` : `CUE ${cue}`)
    return `Estas escuelas ya no están en severidad Crítica y no pueden recibir el remito: ${list.join(', ')}. Quitalas e intentá de nuevo.`
  }
  if (code === 'insufficient_stock' && Array.isArray(body.productIds)) {
    const list = body.productIds.map(String).map((id) => labels.get(id) ?? id)
    return `No hay stock suficiente de: ${list.join(', ')}. Bajá las cantidades o cargá stock.`
  }
  return REMITO_ERRORS[code] ?? 'No se pudo despachar el remito. Intentá nuevamente.'
}
