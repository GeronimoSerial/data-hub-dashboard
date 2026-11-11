import { createHash, randomUUID } from 'node:crypto'
import type { SessionUser } from '@/lib/acl'
import { BookletServiceError, type CampaignPolicy, type IdempotencyRecord } from './inventory'
import { approvalRepository, type ApprovalRequestRecord, type ApprovalRepository } from './approvals'
import { isBookletAdmin } from './permissions'
import type { Eligibility, QuantityLine, RemainderInput, RequestChainView, RequestView } from './types'

export type RemainderRepository = Omit<Pick<ApprovalRepository,
  | 'getAccountStatus' | 'hasActiveMembership' | 'hasSchoolAssignment' | 'getCampaign'
  | 'getRequest' | 'listChain' | 'getCurrentEligibility' | 'approvalAuthorityReady'
  | 'productExists' | 'getIdempotency' | 'saveIdempotency' | 'lockRequest' | 'lockChain' | 'lockIdempotency'
  | 'saveRemainder' | 'prepareCurrentEligibilityProjection'
>, 'transaction'> & { transaction<T>(operation: (repository: RemainderRepository) => Promise<T>): Promise<T> }

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const positiveLines = (lines: QuantityLine[]) => Array.isArray(lines) && lines.length > 0
  && lines.every((line) => Number.isSafeInteger(line.quantity) && line.quantity > 0 && line.productId.trim() !== '')
  && new Set(lines.map((line) => line.productId)).size === lines.length

function assertCampaign(campaign: CampaignPolicy | null): void {
  if (!campaign || campaign.status !== 'active') throw new BookletServiceError('campaign_inactive', 409)
  if (!campaign.distributionEnabled || campaign.overassignmentAllowed === null || campaign.overassignmentAllowed) throw new BookletServiceError('policy_unresolved', 409)
}

function summarize(rootRequestId: string, rows: ApprovalRequestRecord[]): RequestChainView {
  const root = rows.find((row) => row.requestId === rootRequestId)
  if (!root) throw new BookletServiceError('request_not_found', 404)
  const requested = new Map(root.lines.map((line) => [line.productId, line.quantity]))
  const approved = new Map<string, number>()
  const reserved = new Map<string, number>()
  for (const row of rows) {
    for (const line of row.lines) {
      approved.set(line.productId, (approved.get(line.productId) ?? 0) + line.approvedQuantity)
      if (row.requestId !== rootRequestId && (row.status === 'draft' || row.status === 'pending')) {
        reserved.set(line.productId, (reserved.get(line.productId) ?? 0) + line.quantity)
      }
    }
  }
  const lines = (compute: (productId: string, quantity: number) => number) => [...requested.entries()]
    .map(([productId, quantity]) => ({ productId, quantity: Math.max(0, compute(productId, quantity)) }))
    .filter((line) => line.quantity > 0)
  return {
    rootRequestId,
    requested: [...requested].map(([productId, quantity]) => ({ productId, quantity })),
    approved: [...requested.keys()].map((productId) => ({ productId, quantity: approved.get(productId) ?? 0 })).filter((line) => line.quantity > 0),
    remaining: lines((productId, quantity) => quantity - (approved.get(productId) ?? 0)),
    availableRemainder: lines((productId, quantity) => quantity - (approved.get(productId) ?? 0) - (reserved.get(productId) ?? 0)),
  }
}

export async function getRequestChain(
  actor: SessionUser | null,
  requestId: string,
  repository: RemainderRepository = approvalRepository,
): Promise<RequestChainView> {
  if (!requestId.trim()) throw new BookletServiceError('invalid_request', 400)
  return repository.transaction(async (tx) => {
    await tx.lockRequest(requestId)
    const requested = await tx.getRequest(requestId)
    if (!requested) throw new BookletServiceError('request_not_found', 404)
    const rootRequestId = requested.rootRequestId
    await tx.lockChain(rootRequestId)
    const rows = await tx.listChain(rootRequestId)
    const root = rows.find((row) => row.requestId === rootRequestId)
    if (!root || root.rootRequestId !== rootRequestId || root.status !== 'approved') {
      throw new BookletServiceError('request_not_found', 404)
    }

    const account = actor ? await tx.getAccountStatus(actor.id) : null
    const inScope = actor && !actor.banned && account?.emailVerified && !account.banned
      && (await isBookletAdmin(actor, tx)
        || (await tx.hasActiveMembership(actor.id, 'cabecera')
          && await tx.hasSchoolAssignment(actor.id, root.cabeceraCueAnexo, 'cabecera')
          && await tx.hasSchoolAssignment(actor.id, root.recipientCueAnexo, 'cabecera')))
    if (!inScope) throw new BookletServiceError('request_not_found', 404)

    return summarize(rootRequestId, rows)
  })
}

export async function createRemainderRequest(
  actor: SessionUser,
  input: RemainderInput,
  repository: RemainderRepository = approvalRepository,
): Promise<RequestView> {
  if (!input.rootRequestId.trim() || !positiveLines(input.lines)) throw new BookletServiceError('invalid_quantity', 400)
  if (!input.idempotencyKey.trim()) throw new BookletServiceError('invalid_idempotency_key', 400)
  const geSchema = await repository.prepareCurrentEligibilityProjection?.()
  return repository.transaction(async (tx) => {
    await tx.lockRequest(input.rootRequestId)
    const lockedRoot = await tx.getRequest(input.rootRequestId)
    if (!lockedRoot || lockedRoot.requestId !== lockedRoot.rootRequestId) throw new BookletServiceError('request_not_remainder_eligible', 409)
    await tx.lockChain(lockedRoot.rootRequestId)
    const chain = await tx.listChain(lockedRoot.rootRequestId)
    const root = chain.find((row) => row.requestId === input.rootRequestId)
    if (!root || root.status !== 'approved') throw new BookletServiceError('request_not_remainder_eligible', 409)
    const account = await tx.getAccountStatus(actor.id)
    const admin = await isBookletAdmin(actor, tx)
    if (!account?.emailVerified || account.banned || actor.banned
      || (!admin && (!await tx.hasActiveMembership(actor.id, 'cabecera')
        || !await tx.hasSchoolAssignment(actor.id, root.cabeceraCueAnexo, 'cabecera')))) {
      throw new BookletServiceError('forbidden', 403)
    }
    await tx.lockIdempotency(actor.id, 'request.remainder', input.idempotencyKey)
    const payloadHash = hash(input)
    const prior: IdempotencyRecord | null = await tx.getIdempotency(actor.id, 'request.remainder', input.idempotencyKey)
    if (prior) {
      if (prior.payloadHash !== payloadHash) throw new BookletServiceError('idempotency_conflict', 409)
      return prior.response as RequestView
    }

    assertCampaign(await tx.getCampaign(root.campaignId))
    if (!admin && !await tx.approvalAuthorityReady(root.recipientCueAnexo, root.cabeceraCueAnexo)) throw new BookletServiceError('authority_unavailable', 503)
    const eligibility: Eligibility = await tx.getCurrentEligibility(root.recipientCueAnexo, geSchema)
    if (!eligibility.eligible || eligibility.severity !== 'Crítica') throw new BookletServiceError('ineligible', 409)

    const summary = summarize(input.rootRequestId, chain)
    const available = new Map(summary.availableRemainder.map((line) => [line.productId, line.quantity]))
    for (const line of input.lines) {
      if (!await tx.productExists(line.productId)) throw new BookletServiceError('product_not_found', 404)
      if (line.quantity > (available.get(line.productId) ?? 0)) throw new BookletServiceError('remainder_exceeded', 409)
    }

    const requestId = randomUUID()
    const response: RequestView = {
      requestId, campaignId: root.campaignId, recipientCueAnexo: root.recipientCueAnexo,
      recipientName: root.recipientName ?? '', cabeceraCueAnexo: root.cabeceraCueAnexo, status: 'pending',
      lines: input.lines.map((line) => ({ ...line })),
      recommendations: summary.availableRemainder.map((line) => ({
        productId: line.productId, students: null, suggested: line.quantity, sourceCutId: null,
      })),
      submittedAt: eligibility.evaluatedAt,
    }
    const record = { payloadHash, response }
    await tx.saveRemainder({ ...response, createdByUserId: actor.id, parentRequestId: root.requestId, rootRequestId: root.requestId }, input.lines, input.idempotencyKey, record)
    return response
  })
}
