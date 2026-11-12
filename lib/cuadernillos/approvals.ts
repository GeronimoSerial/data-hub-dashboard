import { createHash, randomUUID } from 'node:crypto'
import { and, eq, gte, or, sql } from 'drizzle-orm'
import { getDb, getRawClient } from '@/lib/db'
import { bookletAssignmentSourceRevision, bookletCampaign, bookletIdempotency, bookletMembership, bookletProduct, bookletQuota, bookletRequest, bookletRequestLine, bookletSchoolAssignment, bookletStock, bookletStockMovement, user } from '@/lib/db/schema'
import { hashAssignmentSourceRow, hashConfirmedAssignment, verifyAssignmentSourceRevision } from './assignment-source'
import type { AssignmentSourceRow, AssignmentValidationResult } from './types'
import type { SessionUser } from '@/lib/acl'
import type { BookletCapability } from './types'
import { getSchoolEligibility, lockCurrentEligibilitySources, toDashedCue } from './eligibility'
import { crearEjecutorSql, ensureGeSchema, type GeSchemaReady } from '@/lib/infraestructura/ge-db'
import { listarPartesVigentes } from '@/lib/infraestructura/parte-mapa'
import { BookletServiceError, type CampaignPolicy, type IdempotencyRecord } from './inventory'
import { isBookletAdmin } from './permissions'
import type { ApprovalInput, ApprovalResult, Eligibility, QuantityLine, RejectInput, RequestView } from './types'

export type ApprovalRequestRecord = {
  requestId: string
  campaignId: string
  recipientCueAnexo: string
  cabeceraCueAnexo: string
  rootRequestId: string
  status: 'draft' | 'pending' | 'approved' | 'rejected'
  createdByUserId: string
  recipientName?: string
  lines: Array<QuantityLine & { approvedQuantity: number }>
}

export type ApprovalRepository = {
  prepareCurrentEligibilityProjection?(): Promise<GeSchemaReady>
  transaction<T>(operation: (repository: ApprovalRepository) => Promise<T>): Promise<T>
  lockEligibilitySources(): Promise<void>
  getAccountStatus(userId: string): Promise<{ emailVerified: boolean; banned: boolean } | null>
  hasActiveMembership(userId: string, capability: BookletCapability): Promise<boolean>
  hasSchoolAssignment(userId: string, cueAnexo: string, capability: 'cabecera' | 'supervisor'): Promise<boolean>
  getCampaign(campaignId: string): Promise<CampaignPolicy | null>
  getRequest(requestId: string, lockForUpdate?: boolean): Promise<ApprovalRequestRecord | null>
  listChain(rootRequestId: string): Promise<ApprovalRequestRecord[]>
  getCurrentEligibility(cueAnexo: string, geSchema?: GeSchemaReady): Promise<Eligibility>
  approvalAuthorityReady(cabeceraCueAnexo: string): Promise<boolean>
  isAssignedSupervisor(userId: string, cabeceraCueAnexo: string): Promise<boolean>
  productExists(productId: string): Promise<boolean>
  getStock(campaignId: string, productId: string): Promise<number>
  getQuota(campaignId: string, productId: string, cabeceraCueAnexo: string): Promise<number>
  debitStock(campaignId: string, productId: string, quantity: number): Promise<boolean>
  debitQuota(campaignId: string, productId: string, cabeceraCueAnexo: string, quantity: number): Promise<boolean>
  recordMovement(input: { campaignId: string; productId: string; requestId: string; quantity: number; actorUserId: string; idempotencyKey: string }): Promise<void>
  saveApproval(requestId: string, actorId: string, approvedAt: Date, lines: QuantityLine[]): Promise<void>
  saveRejection(requestId: string, actorId: string, rejectedAt: Date, reason: string): Promise<void>
  saveRemainder(request: RequestView & { createdByUserId: string; parentRequestId: string; rootRequestId: string }, lines: QuantityLine[], idempotencyKey: string, record: IdempotencyRecord): Promise<void>
  getIdempotency(actorId: string, operation: string, key: string): Promise<IdempotencyRecord | null>
  saveIdempotency(actorId: string, operation: string, key: string, record: IdempotencyRecord): Promise<void>
  lockRequest(requestId: string): Promise<void>
  lockChain(rootRequestId: string): Promise<void>
  lockProduct(campaignId: string, productId: string): Promise<void>
  lockQuota(campaignId: string, cabeceraCueAnexo: string, productId: string): Promise<void>
  lockIdempotency(actorId: string, operation: string, key: string): Promise<void>
}

export const createApprovalRepository = (db: Awaited<ReturnType<typeof getDb>>): ApprovalRepository => ({
  async prepareCurrentEligibilityProjection() {
    return ensureGeSchema(crearEjecutorSql(getRawClient()))
  },
  async transaction(operation) { return db.transaction((tx) => operation(createApprovalRepository(tx))) },
  async lockEligibilitySources() { await lockCurrentEligibilitySources(crearEjecutorSql(db)) },
  async getAccountStatus(userId) {
    const [row] = await db.select({ emailVerified: user.emailVerified, banned: user.banned }).from(user).where(eq(user.id, userId)).limit(1).for('update')
    return row ? { emailVerified: row.emailVerified, banned: row.banned === true } : null
  },
  async hasActiveMembership(userId, capability) {
    const [row] = await db.select({ id: bookletMembership.id }).from(bookletMembership)
      .where(and(eq(bookletMembership.userId, userId), eq(bookletMembership.capability, capability), sql`${bookletMembership.revokedAt} IS NULL`)).limit(1).for('update')
    return row !== undefined
  },
  async hasSchoolAssignment(userId, cueAnexo, capability) {
    const userIdColumn = capability === 'cabecera' ? bookletSchoolAssignment.cabeceraUserId : bookletSchoolAssignment.supervisorUserId
    const [row] = await db.select({ cueAnexo: bookletSchoolAssignment.cueAnexo }).from(bookletSchoolAssignment)
      .where(and(eq(bookletSchoolAssignment.cueAnexo, cueAnexo), eq(userIdColumn, userId))).limit(1).for('update')
    return row !== undefined
  },
  async getCampaign(campaignId) {
    const [row] = await db.select({ status: bookletCampaign.status, distributionEnabled: bookletCampaign.distributionEnabled, overassignmentAllowed: bookletCampaign.overassignmentAllowed }).from(bookletCampaign).where(eq(bookletCampaign.id, campaignId)).limit(1).for('update')
    if (!row || !['draft', 'active', 'closed'].includes(row.status)) return null
    return { status: row.status as CampaignPolicy['status'], distributionEnabled: row.distributionEnabled, overassignmentAllowed: row.overassignmentAllowed }
  },
  async getRequest(requestId, lockForUpdate = true) {
    const query = db.select({
      requestId: bookletRequest.id, campaignId: bookletRequest.campaignId,
      recipientCueAnexo: bookletRequest.recipientCueAnexo, cabeceraCueAnexo: bookletRequest.cabeceraCueAnexo,
      rootRequestId: bookletRequest.rootRequestId, parentRequestId: bookletRequest.parentRequestId,
      status: bookletRequest.status, createdByUserId: bookletRequest.createdByUserId,
    }).from(bookletRequest).where(eq(bookletRequest.id, requestId)).limit(1)
    const [row] = lockForUpdate ? await query.for('update') : await query
    if (!row || !['draft', 'pending', 'approved', 'rejected'].includes(row.status)) return null
    const [assignment] = await db.select({ recipientName: bookletSchoolAssignment.schoolName }).from(bookletSchoolAssignment)
      .where(eq(bookletSchoolAssignment.cueAnexo, row.recipientCueAnexo)).limit(1).for('update')
    const lines = await db.select({ productId: bookletRequestLine.productId, quantity: bookletRequestLine.quantity, approvedQuantity: bookletRequestLine.approvedQuantity }).from(bookletRequestLine).where(eq(bookletRequestLine.requestId, requestId)).orderBy(bookletRequestLine.productId)
    return { ...row, rootRequestId: row.rootRequestId ?? row.parentRequestId ?? row.requestId, status: row.status as ApprovalRequestRecord['status'], recipientName: assignment?.recipientName ?? '', lines }
  },
  async listChain(rootRequestId) {
    const ids = await db.select({ id: bookletRequest.id }).from(bookletRequest)
      .where(or(eq(bookletRequest.id, rootRequestId), eq(bookletRequest.rootRequestId, rootRequestId)))
    return (await Promise.all(ids.map(({ id }) => createApprovalRepository(db).getRequest(id, false))))
      .filter((row): row is ApprovalRequestRecord => row !== null)
  },
  async getCurrentEligibility(cueAnexo, geSchema) {
    if (!geSchema) return { eligible: false, severity: null, evaluatedAt: new Date().toISOString() }
    return getSchoolEligibility(cueAnexo, async (cue) => {
      const dashed = toDashedCue(cue)
      const { partes } = await listarPartesVigentes({ cueAnexo: dashed }, {
        db,
        client: crearEjecutorSql(db),
        geSchema,
      })
      const matches = partes.filter((parte) => parte.cueAnexo === dashed)
      return matches.length === 1 ? matches[0].peorSeveridad : null
    })
  },
  // Assignment authority lives on the cabecera row alone: its confirmed staged
  // revision and its responsible accounts (supervisor, cabecera) must be current.
  // Recipient schools carry no assignment row and are not part of this check.
  async approvalAuthorityReady(cabeceraCueAnexo) {
    try {
      // Same rule as the assignment confirmation: responsible accounts may be unverified (GE SSO),
      // so only existence, not-banned and active membership are required.
      const hasActiveConfirmedAccount = async (userId: string, capability: 'supervisor' | 'cabecera') => {
        const [account] = await db.select({ banned: user.banned })
          .from(user).where(eq(user.id, userId)).limit(1).for('update')
        if (!account || account.banned) return false
        const [membership] = await db.select({ id: bookletMembership.id }).from(bookletMembership)
          .where(and(eq(bookletMembership.userId, userId), eq(bookletMembership.capability, capability), sql`${bookletMembership.revokedAt} IS NULL`)).limit(1).for('update')
        return membership !== undefined
      }
      const getTrusted = async (cueAnexo: string) => {
        const [row] = await db.select({
          cueAnexo: bookletSchoolAssignment.cueAnexo,
          relationship: bookletSchoolAssignment.relationship,
          cabeceraCue: bookletSchoolAssignment.cabeceraCue,
          cabeceraUserId: bookletSchoolAssignment.cabeceraUserId,
          supervisorUserId: bookletSchoolAssignment.supervisorUserId,
          sourceRevisionId: bookletSchoolAssignment.sourceRevisionId,
          sourceRowHash: bookletSchoolAssignment.sourceRowHash,
          confirmedAssignmentHash: bookletSchoolAssignment.confirmedAssignmentHash,
          schoolName: bookletSchoolAssignment.schoolName,
          supervisorName: bookletSchoolAssignment.supervisorName,
          provenance: bookletSchoolAssignment.provenance,
          confirmedByUserId: bookletSchoolAssignment.confirmedByUserId,
          confirmedAt: bookletSchoolAssignment.confirmedAt,
        }).from(bookletSchoolAssignment).where(eq(bookletSchoolAssignment.cueAnexo, cueAnexo)).limit(1).for('update')
        if (!row?.sourceRevisionId || !row.sourceRowHash || !row.confirmedAssignmentHash) return null
        const { confirmedAssignmentHash, ...confirmedFacts } = row
        if (hashConfirmedAssignment(confirmedFacts) !== confirmedAssignmentHash) return null
        const [revision] = await db.select({
          status: bookletAssignmentSourceRevision.status,
          sourceId: bookletAssignmentSourceRevision.sourceId,
          sourceHash: bookletAssignmentSourceRevision.sourceHash,
          previewHash: bookletAssignmentSourceRevision.previewHash,
          sourceRows: bookletAssignmentSourceRevision.sourceRows,
          preview: bookletAssignmentSourceRevision.preview,
        })
          .from(bookletAssignmentSourceRevision).where(eq(bookletAssignmentSourceRevision.id, row.sourceRevisionId)).limit(1).for('update')
        if (!revision || revision.status !== 'confirmed') return null
        const sourceRows = revision.sourceRows as AssignmentSourceRow[]
        const preview = revision.preview as AssignmentValidationResult
        if (!verifyAssignmentSourceRevision(revision.sourceId, revision.sourceHash, revision.previewHash, sourceRows, preview)) return null
        const sourceCandidate = preview.accepted.find((candidate) => candidate.cueAnexo === cueAnexo)
        if (!sourceCandidate
          || hashAssignmentSourceRow(sourceCandidate) !== row.sourceRowHash
          || sourceCandidate.schoolName !== row.schoolName
          || sourceCandidate.relationship !== row.relationship
          || sourceCandidate.supervisorName !== row.supervisorName
          || sourceCandidate.cabeceraCue !== row.cabeceraCue
          || hashAssignmentSourceRow(sourceCandidate.provenance) !== hashAssignmentSourceRow(row.provenance)) return null
        return { ...row, revisionStatus: revision.status }
      }
      const head = await getTrusted(cabeceraCueAnexo)
      return head !== null && head.sourceRevisionId !== null && head.sourceRowHash !== null && head.revisionStatus === 'confirmed'
        && head.cueAnexo === cabeceraCueAnexo
        && head.relationship === 'cabecera'
        && head.cabeceraCue === cabeceraCueAnexo
        && await hasActiveConfirmedAccount(head.supervisorUserId, 'supervisor')
        && await hasActiveConfirmedAccount(head.cabeceraUserId, 'cabecera')
    } catch {
      return false
    }
  },
  async isAssignedSupervisor(userId, cabeceraCueAnexo) {
    const [row] = await db.select({ cueAnexo: bookletSchoolAssignment.cueAnexo }).from(bookletSchoolAssignment)
      .where(and(eq(bookletSchoolAssignment.cueAnexo, cabeceraCueAnexo), eq(bookletSchoolAssignment.relationship, 'cabecera'), eq(bookletSchoolAssignment.supervisorUserId, userId))).limit(1).for('update')
    return row !== undefined
  },
  async productExists(productId) { return (await db.select({ id: bookletProduct.id }).from(bookletProduct).where(eq(bookletProduct.id, productId)).limit(1)).length > 0 },
  async getStock(campaignId, productId) {
    const [row] = await db.select({ quantity: bookletStock.quantity }).from(bookletStock).where(and(eq(bookletStock.campaignId, campaignId), eq(bookletStock.productId, productId))).limit(1)
    return row?.quantity ?? 0
  },
  async getQuota(campaignId, productId, cue) {
    const [row] = await db.select({ quantity: bookletQuota.quantity }).from(bookletQuota).where(and(eq(bookletQuota.campaignId, campaignId), eq(bookletQuota.productId, productId), eq(bookletQuota.cabeceraCueAnexo, cue))).limit(1)
    return row?.quantity ?? 0
  },
  async debitStock(campaignId, productId, quantity) {
    const rows = await db.update(bookletStock).set({ quantity: sql`${bookletStock.quantity} - ${quantity}`, updatedAt: new Date() })
      .where(and(eq(bookletStock.campaignId, campaignId), eq(bookletStock.productId, productId), gte(bookletStock.quantity, quantity))).returning({ quantity: bookletStock.quantity })
    return rows.length === 1
  },
  async debitQuota(campaignId, productId, cue, quantity) {
    const rows = await db.update(bookletQuota).set({ quantity: sql`${bookletQuota.quantity} - ${quantity}`, updatedAt: new Date() })
      .where(and(eq(bookletQuota.campaignId, campaignId), eq(bookletQuota.productId, productId), eq(bookletQuota.cabeceraCueAnexo, cue), gte(bookletQuota.quantity, quantity))).returning({ quantity: bookletQuota.quantity })
    return rows.length === 1
  },
  async recordMovement(input) {
    await db.insert(bookletStockMovement).values({ id: randomUUID(), campaignId: input.campaignId, productId: input.productId, quantity: input.quantity, movement: 'approval', idempotencyKey: input.idempotencyKey, requestId: input.requestId, actorUserId: input.actorUserId })
  },
  async saveApproval(requestId, actorId, approvedAt, lines) {
    for (const line of lines) await db.update(bookletRequestLine).set({ approvedQuantity: line.quantity }).where(and(eq(bookletRequestLine.requestId, requestId), eq(bookletRequestLine.productId, line.productId)))
    await db.update(bookletRequest).set({ status: 'approved', approvedByUserId: actorId, approvedAt }).where(eq(bookletRequest.id, requestId))
  },
  async saveRejection(requestId, actorId, rejectedAt, reason) {
    await db.update(bookletRequest).set({ status: 'rejected', rejectedByUserId: actorId, rejectedAt, rejectionReason: reason }).where(eq(bookletRequest.id, requestId))
  },
  async saveRemainder(request, lines, idempotencyKey, record) {
    await db.insert(bookletRequest).values({
      id: request.requestId, campaignId: request.campaignId, recipientCueAnexo: request.recipientCueAnexo,
      cabeceraCueAnexo: request.cabeceraCueAnexo, parentRequestId: request.parentRequestId,
      rootRequestId: request.rootRequestId, status: request.status, createdByUserId: request.createdByUserId,
      submittedAt: request.submittedAt ? new Date(request.submittedAt) : null,
    })
    await db.insert(bookletRequestLine).values(lines.map((line) => ({ requestId: request.requestId, productId: line.productId, quantity: line.quantity })))
    await db.insert(bookletIdempotency).values({ actorUserId: request.createdByUserId, operation: 'request.remainder', idempotencyKey, payloadHash: record.payloadHash, responsePayload: record.response as Record<string, unknown> })
  },
  async getIdempotency(actorId, operation, key) {
    const [row] = await db.select({ payloadHash: bookletIdempotency.payloadHash, response: bookletIdempotency.responsePayload }).from(bookletIdempotency)
      .where(and(eq(bookletIdempotency.actorUserId, actorId), eq(bookletIdempotency.operation, operation), eq(bookletIdempotency.idempotencyKey, key))).limit(1)
    return row ? { payloadHash: row.payloadHash, response: row.response } : null
  },
  async saveIdempotency(actorId, operation, key, record) {
    await db.insert(bookletIdempotency).values({ actorUserId: actorId, operation, idempotencyKey: key, payloadHash: record.payloadHash, responsePayload: record.response as Record<string, unknown> })
  },
  async lockRequest(id) { await db.execute(sql`SELECT pg_advisory_xact_lock(hashtext('booklet-request'), hashtext(${id}))`) },
  async lockChain(id) { await db.execute(sql`SELECT pg_advisory_xact_lock(hashtext('booklet-chain'), hashtext(${id}))`) },
  async lockProduct(campaignId, productId) { await db.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${campaignId}), hashtext(${productId}))`) },
  async lockQuota(campaignId, cue, productId) { await db.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${campaignId}), hashtext(${cue || productId}))`) },
  async lockIdempotency(actorId, operation, key) {
    const lockKey = `${operation}:${key}`
    await db.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${actorId}), hashtext(${lockKey}))`)
  },
})

const databaseRepository = createApprovalRepository(getDb())
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const positiveLines = (lines: QuantityLine[]) => Array.isArray(lines) && lines.length > 0
  && lines.every((line) => Number.isSafeInteger(line.quantity) && line.quantity > 0 && line.productId.trim() !== '')
  && new Set(lines.map((line) => line.productId)).size === lines.length

/** Returns whether the actor acts as a global admin, which skips supervisor membership and assignment. */
async function authorize(actor: SessionUser, request: ApprovalRequestRecord, repo: ApprovalRepository): Promise<boolean> {
  const account = await repo.getAccountStatus(actor.id)
  if (!account || account.banned || actor.banned) throw new BookletServiceError('forbidden', 403)
  if (await isBookletAdmin(actor, repo)) return true
  if (!account.emailVerified) throw new BookletServiceError('forbidden', 403)
  if (!await repo.hasActiveMembership(actor.id, 'supervisor')
    || !await repo.isAssignedSupervisor(actor.id, request.cabeceraCueAnexo)) {
    throw new BookletServiceError('forbidden', 403)
  }
  return false
}

function assertCampaign(campaign: CampaignPolicy | null): void {
  if (!campaign || campaign.status !== 'active') throw new BookletServiceError('campaign_inactive', 409)
  if (!campaign.distributionEnabled || campaign.overassignmentAllowed === null || campaign.overassignmentAllowed) throw new BookletServiceError('policy_unresolved', 409)
}

function assertPending(request: ApprovalRequestRecord | null): asserts request is ApprovalRequestRecord {
  if (!request || request.status !== 'pending') throw new BookletServiceError('request_not_pending', 409)
}

async function replay<T>(repo: ApprovalRepository, actorId: string, operation: string, key: string, payload: unknown): Promise<T | null> {
  if (!key.trim()) throw new BookletServiceError('invalid_idempotency_key', 400)
  await repo.lockIdempotency(actorId, operation, key)
  const record = await repo.getIdempotency(actorId, operation, key)
  if (!record) return null
  if (record.payloadHash !== hash(payload)) throw new BookletServiceError('idempotency_conflict', 409)
  return record.response as T
}

export async function approveRequest(actor: SessionUser, input: ApprovalInput, repository: ApprovalRepository = databaseRepository): Promise<ApprovalResult> {
  if (!positiveLines(input.lines)) throw new BookletServiceError('invalid_quantity', 400)
  const geSchema = await repository.prepareCurrentEligibilityProjection?.()
  return repository.transaction(async (tx) => {
    // Global order: shared source lock before any request/chain/idempotency or
    // inventory row lock; products and quotas remain sorted below. Source
    // statement triggers take the exclusive counterpart before mutating rows.
    await tx.lockEligibilitySources()
    await tx.lockRequest(input.requestId)
    const request = await tx.getRequest(input.requestId)
    if (!request) throw new BookletServiceError('request_not_found', 404)
    await tx.lockChain(request.rootRequestId)
    const admin = await authorize(actor, request, tx)
    const replayed = await replay<ApprovalResult>(tx, actor.id, 'request.approve', input.idempotencyKey, input)
    if (replayed) return replayed
    assertCampaign(await tx.getCampaign(request.campaignId))
    assertPending(request)
    if (!admin && !await tx.approvalAuthorityReady(request.cabeceraCueAnexo)) throw new BookletServiceError('authority_unavailable', 503)
    const eligibility = await tx.getCurrentEligibility(request.recipientCueAnexo, geSchema)
    if (!eligibility.eligible || eligibility.severity !== 'Crítica') throw new BookletServiceError('authority_changed', 409)

    const requested = new Map(request.lines.map((line) => [line.productId, line.quantity]))
    const approved = new Map<string, number>()
    for (const line of input.lines) {
      if (!await tx.productExists(line.productId)) throw new BookletServiceError('product_not_found', 404)
      if (!requested.has(line.productId) || line.quantity > requested.get(line.productId)!) throw new BookletServiceError('invalid_approval', 400)
      approved.set(line.productId, line.quantity)
    }
    const products = [...approved.keys()].sort()
    for (const productId of products) await tx.lockProduct(request.campaignId, productId)
    for (const productId of products) await tx.lockQuota(request.campaignId, request.cabeceraCueAnexo, productId)

    for (const productId of products) {
      const quantity = approved.get(productId)!
      const [stock, quota] = await Promise.all([
        tx.getStock(request.campaignId, productId),
        tx.getQuota(request.campaignId, productId, request.cabeceraCueAnexo),
      ])
      if (quantity > stock || quantity > quota) throw new BookletServiceError('insufficient_availability', 409)
    }

    const approvedLines = products.map((productId) => ({ productId, quantity: approved.get(productId)! }))
    const remaining = request.lines.map((line) => ({ productId: line.productId, quantity: line.quantity - (approved.get(line.productId) ?? 0) })).filter((line) => line.quantity > 0)
    const approvedAt = new Date()
    for (const line of approvedLines) {
      if (!await tx.debitStock(request.campaignId, line.productId, line.quantity)) throw new BookletServiceError('insufficient_availability', 409)
      if (!await tx.debitQuota(request.campaignId, line.productId, request.cabeceraCueAnexo, line.quantity)) throw new BookletServiceError('insufficient_availability', 409)
      await tx.recordMovement({ campaignId: request.campaignId, productId: line.productId, requestId: request.requestId, quantity: line.quantity, actorUserId: actor.id, idempotencyKey: input.idempotencyKey })
    }
    await tx.saveApproval(request.requestId, actor.id, approvedAt, approvedLines)
    const response: ApprovalResult = { requestId: request.requestId, status: 'approved', approved: approvedLines, remaining, signerUserId: actor.id, approvedAt: approvedAt.toISOString() }
    await tx.saveIdempotency(actor.id, 'request.approve', input.idempotencyKey, { payloadHash: hash(input), response })
    return response
  })
}

export async function rejectRequest(actor: SessionUser, input: RejectInput, repository: ApprovalRepository = databaseRepository): Promise<RequestView> {
  if (!input.reason.trim() || input.reason.trim().length > 1000) throw new BookletServiceError('invalid_rejection_reason', 400)
  return repository.transaction(async (tx) => {
    await tx.lockRequest(input.requestId)
    const request = await tx.getRequest(input.requestId)
    if (!request) throw new BookletServiceError('request_not_found', 404)
    await tx.lockChain(request.rootRequestId)
    const admin = await authorize(actor, request, tx)
    const replayed = await replay<RequestView>(tx, actor.id, 'request.reject', input.idempotencyKey, input)
    if (replayed) return replayed
    assertCampaign(await tx.getCampaign(request.campaignId))
    assertPending(request)
    if (!admin && !await tx.approvalAuthorityReady(request.cabeceraCueAnexo)) throw new BookletServiceError('authority_unavailable', 503)
    const rejectedAt = new Date()
    await tx.saveRejection(request.requestId, actor.id, rejectedAt, input.reason.trim())
    const response: RequestView = {
      requestId: request.requestId, campaignId: request.campaignId, recipientCueAnexo: request.recipientCueAnexo,
      recipientName: request.recipientName ?? '', cabeceraCueAnexo: request.cabeceraCueAnexo, status: 'rejected',
      lines: request.lines.map(({ productId, quantity }) => ({ productId, quantity })), recommendations: [], submittedAt: null,
    }
    await tx.saveIdempotency(actor.id, 'request.reject', input.idempotencyKey, { payloadHash: hash(input), response })
    return response
  })
}

export { databaseRepository as approvalRepository }
