import type { CabeceraView } from '@/lib/cuadernillos/cabeceras'
import type { BookletAssignmentsPage, BookletBalanceView, BookletCampaignOption, BookletRequestSummary, BookletRequestsPage, EnrollmentRecommendation } from '@/lib/cuadernillos/types'

export type CriticalSchool = { cueAnexo: string; nombre: string; departamento: string; severity: string }
export type CabeceraChoice = { cue: string; nombre: string }
export type Overview = { campaignId: string | null; campaignOptions: BookletCampaignOption[]; balances: BookletBalanceView[] }

export const PAGE_SIZE = 50

/** A load that gets no answer in this time fails visibly instead of spinning forever. */
export const LOAD_TIMEOUT_MS = 15_000

export const ERROR_LABELS: Record<string, string> = {
  ineligible: 'La escuela ya no está en severidad Crítica. Buscá otra escuela.',
  quota_exceeded: 'La cantidad supera el cupo disponible de la cabecera.',
  forbidden: 'Esta cuenta no puede pedir para esta cabecera.',
  campaign_inactive: 'La campaña no está activa.',
  idempotency_conflict: 'El reintento no coincide con el pedido anterior. Volvé a intentar.',
}

export const REMAINDER_ERRORS: Record<string, string> = {
  request_not_found: 'El pedido ya no está disponible.',
  request_not_pending: 'El pedido ya no está pendiente. Actualizá la lista.',
  request_not_remainder_eligible: 'Este pedido no admite un remanente.',
  remainder_exceeded: 'El remanente disponible cambió. Actualizá la lista antes de volver a intentar.',
  idempotency_conflict: 'El reintento no coincide con el remanente anterior. Actualizá la lista.',
  forbidden: 'Esta cuenta no puede pedir remanentes para este pedido.',
}

export async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null)
}

/**
 * GET for a load effect. Resolves only with a body the guard accepts; any network
 * error, timeout, non-ok status or unexpected body rejects with `failure`.
 * `cancel` aborts the request and clears the timeout (call it from effect cleanup).
 */
export function loadJson<T>(url: string, isExpected: (value: unknown) => value is T, failure: string) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LOAD_TIMEOUT_MS)
  const promise = (async (): Promise<T> => {
    try {
      const response = await fetch(url, { cache: 'no-store', signal: controller.signal })
      const data = await readJson(response)
      if (!response.ok || !isExpected(data)) throw new Error(failure)
      return data
    } catch {
      throw new Error(failure)
    } finally {
      clearTimeout(timer)
    }
  })()
  return { promise, cancel: () => { clearTimeout(timer); controller.abort() } }
}

export function errorCode(data: unknown): string {
  return data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : ''
}

/** ENOS ficha route takes the dashed CUE form (1801234-57) for a 9-digit booklet CUE (180123457). */
export function fichaEscuelaHref(cueAnexo: string): string | null {
  if (!/^\d{9}$/.test(cueAnexo)) return null
  return `/mapas/infraestructura/escuelas/${cueAnexo.slice(0, 7)}-${cueAnexo.slice(7)}`
}

export function isOverview(value: unknown): value is Overview {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return (row.campaignId === null || typeof row.campaignId === 'string')
    && Array.isArray(row.campaignOptions) && Array.isArray(row.balances)
}

export function isSchoolList(value: unknown): value is { schools: CriticalSchool[] } {
  return Boolean(value && typeof value === 'object' && Array.isArray((value as { schools?: unknown }).schools))
}

export function isRecommendationList(value: unknown): value is { recommendations: EnrollmentRecommendation[] } {
  return Boolean(value && typeof value === 'object' && Array.isArray((value as { recommendations?: unknown }).recommendations))
}

export function isCabeceraList(value: unknown): value is { cabeceras: CabeceraView[] } {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { cabeceras?: unknown }).cabeceras)) return false
  return (value as { cabeceras: unknown[] }).cabeceras.every((row) => row !== null && typeof row === 'object'
    && typeof (row as CabeceraView).cue === 'string' && typeof (row as CabeceraView).nombre === 'string')
}

export function isAssignmentsPage(value: unknown): value is BookletAssignmentsPage {
  return Boolean(value && typeof value === 'object' && Array.isArray((value as { items?: unknown }).items))
}

function isLine(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return typeof row.productId === 'string' && typeof row.productLabel === 'string'
    && Number.isSafeInteger(row.quantity) && (row.quantity as number) >= 0
}

export function isRequestsPage(value: unknown): value is BookletRequestsPage {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return (row.campaignId === null || typeof row.campaignId === 'string')
    && Array.isArray(row.campaignOptions)
    && Array.isArray(row.requests) && row.requests.every(isRequest)
    && typeof row.hasMore === 'boolean'
    && (row.nextCursor === null || typeof row.nextCursor === 'string')
}

function isRequest(value: unknown): value is BookletRequestSummary {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return typeof row.requestId === 'string' && typeof row.rootRequestId === 'string'
    && typeof row.recipientCueAnexo === 'string' && typeof row.recipientName === 'string'
    && typeof row.cabeceraCueAnexo === 'string' && typeof row.cabeceraName === 'string'
    && (row.status === 'draft' || row.status === 'pending' || row.status === 'approved' || row.status === 'rejected')
    && Array.isArray(row.requested) && row.requested.every(isLine)
    && Array.isArray(row.approved) && row.approved.every(isLine)
    && Array.isArray(row.remaining) && row.remaining.every(isLine)
    && (row.submittedAt === null || typeof row.submittedAt === 'string')
    && (row.approvedAt === null || typeof row.approvedAt === 'string')
    && (row.approvalIdentity === null || typeof row.approvalIdentity === 'string')
}

/** Query string for the scoped read endpoints; `viewAs` is only sent while viewing another account. */
export function scopedQuery(params: Record<string, string | null | undefined>): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value)
  return query.toString()
}

export function requestLabel(request: BookletRequestSummary): string {
  if (request.status === 'approved') return request.remaining.length ? 'Aprobado parcial' : 'Aprobado'
  if (request.status === 'pending') return 'Pendiente'
  if (request.status === 'rejected') return 'Rechazado'
  return 'Borrador'
}
