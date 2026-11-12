import type { BookletBalanceView, BookletRequestLineView, BookletRequestSummary, BookletRequestsPage } from '@/lib/cuadernillos/types'

function isLine(value: unknown): value is BookletRequestLineView {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return typeof row.productId === 'string' && typeof row.productLabel === 'string'
    && Number.isSafeInteger(row.quantity) && (row.quantity as number) >= 0
}

function isRequest(value: unknown): value is BookletRequestSummary {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return typeof row.requestId === 'string' && typeof row.rootRequestId === 'string'
    && typeof row.recipientCueAnexo === 'string' && /^\d{9}$/.test(row.recipientCueAnexo)
    && typeof row.recipientName === 'string'
    && typeof row.cabeceraCueAnexo === 'string' && /^\d{9}$/.test(row.cabeceraCueAnexo)
    && typeof row.cabeceraName === 'string'
    && (row.status === 'draft' || row.status === 'pending' || row.status === 'approved' || row.status === 'rejected')
    && Array.isArray(row.requested) && row.requested.every(isLine)
    && Array.isArray(row.approved) && row.approved.every(isLine)
    && Array.isArray(row.remaining) && row.remaining.every(isLine)
    && (row.submittedAt === null || typeof row.submittedAt === 'string')
    && (row.approvedAt === null || typeof row.approvedAt === 'string')
    && (row.approvalIdentity === null || typeof row.approvalIdentity === 'string')
}

function isCampaign(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return typeof row.id === 'string' && typeof row.name === 'string' && typeof row.distributionEnabled === 'boolean'
}

export function isRequestsPage(value: unknown): value is BookletRequestsPage {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return (row.campaignId === null || typeof row.campaignId === 'string')
    && Array.isArray(row.campaignOptions) && row.campaignOptions.every(isCampaign)
    && Array.isArray(row.requests) && row.requests.every(isRequest)
    && typeof row.hasMore === 'boolean'
    && (row.nextCursor === null || typeof row.nextCursor === 'string')
}

export function isBalances(value: unknown): value is BookletBalanceView[] {
  return Array.isArray(value) && value.every((row) => row !== null && typeof row === 'object'
    && typeof (row as Record<string, unknown>).productId === 'string')
}
