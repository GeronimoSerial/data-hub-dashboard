import { createHash, randomUUID } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import {
  bookletCampaign, bookletIdempotency, bookletProduct, bookletQuota, bookletRequest,
  bookletRequestLine, bookletSchoolAssignment, user,
} from '@/lib/db/schema'
import type { SessionUser } from '@/lib/acl'
import { getSchoolEligibility } from './eligibility'
import { BookletServiceError, type CampaignPolicy, type IdempotencyRecord } from './inventory'
import { hasBookletCapability, isBookletAdmin, type BookletPermissionRepository } from './permissions'
import { getEnrollmentRecommendations } from './enrollment'
import type { CreateRequestInput as BaseCreateRequestInput, EnrollmentRecommendation, Eligibility, QuantityLine, RequestView } from './types'

/** The cabecera cue is a scope selector validated against the session actor; identity never comes from the body. */
export type CreateRequestInput = BaseCreateRequestInput & { cabeceraCueAnexo?: string }

export type RequestAssignment = {
  cueAnexo: string
  relationship: 'cabecera' | 'dependiente'
  cabeceraCue: string
  cabeceraUserId: string
  schoolName?: string
}

export type RequestRepository = BookletPermissionRepository & {
  transaction<T>(operation: (repository: RequestRepository) => Promise<T>): Promise<T>
  getCampaign(campaignId: string): Promise<CampaignPolicy | null>
  productExists(productId: string): Promise<boolean>
  getQuota(campaignId: string, productId: string, cabeceraCue: string): Promise<number>
  getAssignment(cueAnexo: string): Promise<RequestAssignment | null>
  listCabeceraCuesForUser(userId: string): Promise<string[]>
  getRequestByIdempotency(actorId: string, key: string): Promise<IdempotencyRecord | null>
  saveRequest(request: RequestView & { createdByUserId: string }, lines: QuantityLine[], idempotency: { key: string; record: IdempotencyRecord }): Promise<void>
  getEnrollmentRecommendations(cueAnexo: string, campaignId: string): Promise<EnrollmentRecommendation[]>
  lockIdempotency?(actorId: string, operation: string, key: string): Promise<void>
}

const makeDatabaseRepository = (db: Awaited<ReturnType<typeof getDb>>): RequestRepository => ({
  async transaction(operation) { return db.transaction((tx) => operation(makeDatabaseRepository(tx))) },
  async getAccountStatus(userId) {
    const [row] = await db.select({ emailVerified: user.emailVerified, banned: user.banned }).from(user).where(eq(user.id, userId)).limit(1)
    return row ? { emailVerified: row.emailVerified, banned: row.banned === true } : null
  },
  async hasActiveMembership(userId, capability) {
    const { bookletMembership } = await import('@/lib/db/schema')
    const [row] = await db.select({ id: bookletMembership.id }).from(bookletMembership)
      .where(and(eq(bookletMembership.userId, userId), eq(bookletMembership.capability, capability), sql`${bookletMembership.revokedAt} IS NULL`)).limit(1)
    return row !== undefined
  },
  async hasSchoolAssignment(userId, cueAnexo, capability) {
    const responsible = capability === 'cabecera' ? bookletSchoolAssignment.cabeceraUserId : bookletSchoolAssignment.supervisorUserId
    const [row] = await db.select({ cueAnexo: bookletSchoolAssignment.cueAnexo }).from(bookletSchoolAssignment)
      .where(and(eq(bookletSchoolAssignment.cueAnexo, cueAnexo), eq(responsible, userId))).limit(1)
    return row !== undefined
  },
  async getCampaign(campaignId) {
    const [row] = await db.select({ status: bookletCampaign.status, distributionEnabled: bookletCampaign.distributionEnabled, overassignmentAllowed: bookletCampaign.overassignmentAllowed })
      .from(bookletCampaign).where(eq(bookletCampaign.id, campaignId)).limit(1)
    if (!row || !['draft', 'active', 'closed'].includes(row.status)) return null
    return { status: row.status as CampaignPolicy['status'], distributionEnabled: row.distributionEnabled, overassignmentAllowed: row.overassignmentAllowed }
  },
  async productExists(productId) { return (await db.select({ id: bookletProduct.id }).from(bookletProduct).where(eq(bookletProduct.id, productId)).limit(1)).length > 0 },
  async getQuota(campaignId, productId, cabeceraCue) {
    const [row] = await db.select({ quantity: bookletQuota.quantity }).from(bookletQuota).where(and(eq(bookletQuota.campaignId, campaignId), eq(bookletQuota.productId, productId), eq(bookletQuota.cabeceraCueAnexo, cabeceraCue))).limit(1)
    return row?.quantity ?? 0
  },
  async getAssignment(cueAnexo) {
    const [row] = await db.select({ cueAnexo: bookletSchoolAssignment.cueAnexo, relationship: bookletSchoolAssignment.relationship, cabeceraCue: bookletSchoolAssignment.cabeceraCue, cabeceraUserId: bookletSchoolAssignment.cabeceraUserId, schoolName: bookletSchoolAssignment.schoolName })
      .from(bookletSchoolAssignment).where(eq(bookletSchoolAssignment.cueAnexo, cueAnexo)).limit(1)
    return row && (row.relationship === 'cabecera' || row.relationship === 'dependiente') ? { ...row, relationship: row.relationship } : null
  },
  async listCabeceraCuesForUser(userId) {
    const rows = await db.select({ cueAnexo: bookletSchoolAssignment.cueAnexo }).from(bookletSchoolAssignment)
      .where(and(eq(bookletSchoolAssignment.relationship, 'cabecera'), eq(bookletSchoolAssignment.cabeceraUserId, userId)))
    return rows.map((row) => row.cueAnexo)
  },
  async getRequestByIdempotency(actorId, key) {
    const [row] = await db.select({ payloadHash: bookletIdempotency.payloadHash, response: bookletIdempotency.responsePayload }).from(bookletIdempotency)
      .where(and(eq(bookletIdempotency.actorUserId, actorId), eq(bookletIdempotency.operation, 'request.create'), eq(bookletIdempotency.idempotencyKey, key))).limit(1)
    return row ? { payloadHash: row.payloadHash, response: row.response } : null
  },
  async lockIdempotency(actorId, operation, key) {
    const lockKey = `${operation}:${key}`
    await db.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${actorId}), hashtext(${lockKey}))`)
  },
  async saveRequest(request, lines, idempotency) {
    await db.insert(bookletRequest).values({ id: request.requestId, campaignId: request.campaignId, recipientCueAnexo: request.recipientCueAnexo, cabeceraCueAnexo: request.cabeceraCueAnexo, parentRequestId: null, rootRequestId: request.requestId, status: request.status, createdByUserId: request.createdByUserId, submittedAt: request.submittedAt ? new Date(request.submittedAt) : null })
    await db.insert(bookletRequestLine).values(lines.map((line) => ({ requestId: request.requestId, productId: line.productId, quantity: line.quantity })))
    await db.insert(bookletIdempotency).values({ actorUserId: request.createdByUserId, operation: 'request.create', idempotencyKey: idempotency.key, payloadHash: idempotency.record.payloadHash, responsePayload: idempotency.record.response as Record<string, unknown> })
  },
  getEnrollmentRecommendations,
})

const databaseRepository = makeDatabaseRepository(getDb())
const digest = (input: unknown) => createHash('sha256').update(JSON.stringify(input)).digest('hex')
const validCue = (cue: string) => /^\d{9}$/.test(cue)

export async function createRequest(
  actor: SessionUser,
  input: CreateRequestInput,
  repository: RequestRepository = databaseRepository,
  eligibilityProvider: (cue: string) => Promise<Eligibility> = getSchoolEligibility,
): Promise<RequestView> {
  if (!validCue(input.recipientCueAnexo)) throw new BookletServiceError('invalid_assignment', 400)
  if (!Array.isArray(input.lines) || input.lines.length === 0) throw new BookletServiceError('invalid_quantity', 400)
  if (input.lines.some((line) => !Number.isSafeInteger(line.quantity) || line.quantity <= 0)
    || new Set(input.lines.map((line) => line.productId)).size !== input.lines.length) throw new BookletServiceError('invalid_quantity', 400)
  if (!input.idempotencyKey.trim()) throw new BookletServiceError('invalid_idempotency_key', 400)
  if (!await hasBookletCapability(actor, 'cabecera', repository)) throw new BookletServiceError('forbidden', 403)

  return repository.transaction(async (tx) => {
    const campaign = await tx.getCampaign(input.campaignId)
    if (!campaign || campaign.status !== 'active') throw new BookletServiceError('campaign_inactive', 409)
    if (!campaign.distributionEnabled || campaign.overassignmentAllowed === null || campaign.overassignmentAllowed) throw new BookletServiceError('policy_unresolved', 409)
    await tx.lockIdempotency?.(actor.id, 'request.create', input.idempotencyKey)
    const payloadHash = digest(input)
    const prior = await tx.getRequestByIdempotency(actor.id, input.idempotencyKey)
    if (prior) {
      if (prior.payloadHash !== payloadHash) throw new BookletServiceError('idempotency_conflict', 409)
      return prior.response as RequestView
    }

    // The requesting cabecera is the signed actor's own cabecera row; admins choose any cabecera row.
    const admin = await isBookletAdmin(actor, tx)
    const owned = admin ? [] : await tx.listCabeceraCuesForUser(actor.id)
    const cabeceraCue = input.cabeceraCueAnexo ?? (owned.length === 1 ? owned[0] : null)
    if (!cabeceraCue || (!admin && !owned.includes(cabeceraCue))) throw new BookletServiceError('forbidden', 403)
    const head = await tx.getAssignment(cabeceraCue)
    if (!head || head.relationship !== 'cabecera' || head.cueAnexo !== cabeceraCue
      || (!admin && head.cabeceraUserId !== actor.id)) throw new BookletServiceError('forbidden', 403)

    for (const line of input.lines) {
      if (!await tx.productExists(line.productId)) throw new BookletServiceError('product_not_found', 404)
      if (line.quantity > await tx.getQuota(input.campaignId, line.productId, cabeceraCue)) throw new BookletServiceError('quota_exceeded', 409)
    }

    // Any school whose current severity is Crítica may be requested; it need not be assigned to the cabecera.
    const eligibility = await eligibilityProvider(input.recipientCueAnexo)
    if (!eligibility.eligible || eligibility.severity !== 'Crítica') throw new BookletServiceError('ineligible', 409)
    const status = input.submit ? 'pending' : 'draft'
    const recommendations = await tx.getEnrollmentRecommendations(input.recipientCueAnexo, input.campaignId)
    const response: RequestView = {
      requestId: randomUUID(), campaignId: input.campaignId, recipientCueAnexo: input.recipientCueAnexo,
      recipientName: '', cabeceraCueAnexo: cabeceraCue, status,
      lines: input.lines.map((line) => ({ ...line })), recommendations,
      submittedAt: input.submit ? eligibility.evaluatedAt : null,
    }
    await tx.saveRequest({ ...response, createdByUserId: actor.id }, input.lines, { key: input.idempotencyKey, record: { payloadHash, response } })
    return response
  })
}

export { databaseRepository as requestRepository }
