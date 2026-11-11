import { and, desc, eq, inArray, isNull, lt, or } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import type { SessionUser } from '@/lib/acl'
import { bookletCampaign, bookletMembership, bookletProduct, bookletRequest, bookletRequestLine, bookletSchoolAssignment, user } from '@/lib/db/schema'
import type { BookletCampaignOption, BookletCapability, BookletRequestSummary } from './types'

export type BookletPermissionRepository = {
  getAccountStatus(userId: string): Promise<{ emailVerified: boolean; banned: boolean } | null>
  hasActiveMembership(userId: string, capability: BookletCapability): Promise<boolean>
  hasSchoolAssignment(userId: string, cueAnexo: string, capability: 'cabecera' | 'supervisor'): Promise<boolean>
}

export type RequestSchoolScope = {
  recipientCueAnexo: string
  cabeceraCueAnexo: string
}

export type BookletRequestPermissionRepository = BookletPermissionRepository & {
  getRequestSchoolScope(requestId: string): Promise<RequestSchoolScope | null>
}

export type BookletRequestCursor = { createdAt: string; requestId: string }
export type BookletRequestReadScope = { planning: boolean; cabeceraCues: string[]; supervisorCues: string[] }
export type BookletRequestReadCandidate = BookletRequestSummary & { createdAt: string }
export type BookletRequestReadRepository = BookletRequestPermissionRepository & {
  listActiveCampaigns(): Promise<BookletCampaignOption[]>
  listAssignedCues(userId: string, capability: 'cabecera' | 'supervisor'): Promise<string[]>
  listRequestCandidates(input: {
    campaignId: string
    scope: BookletRequestReadScope
    after: BookletRequestCursor | null
    limit: number
  }): Promise<BookletRequestReadCandidate[]>
}
export type BookletRequestPageQuery = { campaignId?: string; cursor?: string; limit?: number }
export type BookletRequestPage = {
  campaignId: string | null
  campaignOptions: BookletCampaignOption[]
  requests: BookletRequestSummary[]
  hasMore: boolean
  nextCursor: string | null
}

export class BookletRequestReadError extends Error {
  readonly code: string
  readonly status: number
  constructor(code: string, status: number) {
    super(code)
    this.name = 'BookletRequestReadError'
    this.code = code
    this.status = status
  }
}

const databaseRepository: BookletPermissionRepository = {
  async getAccountStatus(userId) {
    const [account] = await getDb()
      .select({ emailVerified: user.emailVerified, banned: user.banned })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1)
    return account ? { emailVerified: account.emailVerified, banned: account.banned === true } : null
  },

  async hasActiveMembership(userId, capability) {
    const [membership] = await getDb()
      .select({ id: bookletMembership.id })
      .from(bookletMembership)
      .where(and(
        eq(bookletMembership.userId, userId),
        eq(bookletMembership.capability, capability),
        isNull(bookletMembership.revokedAt),
      ))
      .limit(1)
    return membership !== undefined
  },

  async hasSchoolAssignment(userId, cueAnexo, capability) {
    const responsibleUserId = capability === 'cabecera'
      ? bookletSchoolAssignment.cabeceraUserId
      : bookletSchoolAssignment.supervisorUserId
    const [assignment] = await getDb()
      .select({ cueAnexo: bookletSchoolAssignment.cueAnexo })
      .from(bookletSchoolAssignment)
      .where(and(
        eq(bookletSchoolAssignment.cueAnexo, cueAnexo),
        eq(responsibleUserId, userId),
      ))
      .limit(1)
    return assignment !== undefined
  },
}

const requestScopeRepository: BookletRequestPermissionRepository = {
  ...databaseRepository,
  async getRequestSchoolScope(requestId) {
    const [request] = await getDb().select({ recipientCueAnexo: bookletRequest.recipientCueAnexo, cabeceraCueAnexo: bookletRequest.cabeceraCueAnexo })
      .from(bookletRequest).where(eq(bookletRequest.id, requestId)).limit(1)
    return request ?? null
  },
}

const asIso = (value: Date | string | null): string | null => value === null ? null : value instanceof Date ? value.toISOString() : new Date(value).toISOString()

const databaseReadRepository: BookletRequestReadRepository = {
  ...requestScopeRepository,
  async listActiveCampaigns() {
    return getDb().select({
      id: bookletCampaign.id, name: bookletCampaign.name,
      distributionEnabled: bookletCampaign.distributionEnabled, overassignmentAllowed: bookletCampaign.overassignmentAllowed,
    }).from(bookletCampaign).where(eq(bookletCampaign.status, 'active')).orderBy(bookletCampaign.name, bookletCampaign.id)
  },
  async listAssignedCues(userId, capability) {
    const responsibleUserId = capability === 'cabecera' ? bookletSchoolAssignment.cabeceraUserId : bookletSchoolAssignment.supervisorUserId
    const predicates = [eq(responsibleUserId, userId)]
    if (capability === 'cabecera') predicates.push(eq(bookletSchoolAssignment.relationship, 'cabecera'))
    const rows = await getDb().select({ cueAnexo: bookletSchoolAssignment.cueAnexo }).from(bookletSchoolAssignment).where(and(...predicates))
    return rows.map((row) => row.cueAnexo)
  },
  async listRequestCandidates({ campaignId, scope, after, limit }) {
    const predicates = [eq(bookletRequest.campaignId, campaignId)]
    if (!scope.planning) {
      const scopes = []
      if (scope.cabeceraCues.length) scopes.push(inArray(bookletRequest.cabeceraCueAnexo, scope.cabeceraCues))
      if (scope.supervisorCues.length) scopes.push(inArray(bookletRequest.recipientCueAnexo, scope.supervisorCues))
      if (scopes.length === 0) return []
      predicates.push(or(...scopes)!)
    }
    if (after) {
      const createdAt = new Date(after.createdAt)
      predicates.push(or(
        lt(bookletRequest.createdAt, createdAt),
        and(eq(bookletRequest.createdAt, createdAt), lt(bookletRequest.id, after.requestId)),
      )!)
    }
    const page = await getDb().select({
      requestId: bookletRequest.id, rootRequestId: bookletRequest.rootRequestId, parentRequestId: bookletRequest.parentRequestId,
      recipientCueAnexo: bookletRequest.recipientCueAnexo,
      cabeceraCueAnexo: bookletRequest.cabeceraCueAnexo, status: bookletRequest.status,
      submittedAt: bookletRequest.submittedAt, approvedAt: bookletRequest.approvedAt,
      approvalIdentity: bookletRequest.approvedByUserId, createdAt: bookletRequest.createdAt,
    }).from(bookletRequest).where(and(...predicates))
      .orderBy(desc(bookletRequest.createdAt), desc(bookletRequest.id)).limit(limit)
    if (!page.length) return []
    const cues = [...new Set(page.flatMap((row) => [row.recipientCueAnexo, row.cabeceraCueAnexo]))]
    const [schools, lines] = await Promise.all([
      getDb().select({ cueAnexo: bookletSchoolAssignment.cueAnexo, schoolName: bookletSchoolAssignment.schoolName })
        .from(bookletSchoolAssignment).where(inArray(bookletSchoolAssignment.cueAnexo, cues)),
      getDb().select({ requestId: bookletRequestLine.requestId, productId: bookletRequestLine.productId,
        productLabel: bookletProduct.name, quantity: bookletRequestLine.quantity, approvedQuantity: bookletRequestLine.approvedQuantity })
        .from(bookletRequestLine).innerJoin(bookletProduct, eq(bookletProduct.id, bookletRequestLine.productId))
        .where(inArray(bookletRequestLine.requestId, page.map((row) => row.requestId)))
        .orderBy(bookletRequestLine.requestId, bookletProduct.name, bookletProduct.id),
    ])
    const schoolNames = new Map(schools.map((school) => [school.cueAnexo, school.schoolName]))
    const linesByRequest = new Map<string, typeof lines>()
    for (const line of lines) linesByRequest.set(line.requestId, [...(linesByRequest.get(line.requestId) ?? []), line])
    return page.flatMap((row) => {
      if (!['draft', 'pending', 'approved', 'rejected'].includes(row.status)) return []
      const requestLines = linesByRequest.get(row.requestId) ?? []
      return [{
        requestId: row.requestId, rootRequestId: row.rootRequestId ?? row.parentRequestId ?? row.requestId,
        recipientCueAnexo: row.recipientCueAnexo,
        recipientName: schoolNames.get(row.recipientCueAnexo) ?? '',
        cabeceraCueAnexo: row.cabeceraCueAnexo, cabeceraName: schoolNames.get(row.cabeceraCueAnexo) ?? '',
        status: row.status as BookletRequestSummary['status'],
        requested: requestLines.map(({ productId, productLabel, quantity }) => ({ productId, productLabel, quantity })),
        approved: requestLines.filter((line) => line.approvedQuantity > 0).map(({ productId, productLabel, approvedQuantity }) => ({ productId, productLabel, quantity: approvedQuantity })),
        remaining: requestLines.filter((line) => line.quantity > line.approvedQuantity).map(({ productId, productLabel, quantity, approvedQuantity }) => ({ productId, productLabel, quantity: quantity - approvedQuantity })),
        submittedAt: asIso(row.submittedAt), approvedAt: asIso(row.approvedAt), approvalIdentity: row.approvalIdentity,
        createdAt: row.createdAt.toISOString(),
      }]
    })
  },
}

/** Checks current account state and durable module membership; GE roles do not grant access. */
export async function hasBookletCapability(
  actor: SessionUser | null,
  capability: BookletCapability,
  repository: BookletPermissionRepository = databaseRepository,
): Promise<boolean> {
  if (!actor || actor.banned) return false
  try {
    const account = await repository.getAccountStatus(actor.id)
    if (!account || !account.emailVerified || account.banned) return false
    return repository.hasActiveMembership(actor.id, capability)
  } catch {
    return false
  }
}

/** Checks a school assignment by account ID, never by supervisor or school name. */
export async function canAccessSchool(
  actor: SessionUser | null,
  cueAnexo: string,
  capability: BookletCapability,
  repository: BookletPermissionRepository = databaseRepository,
): Promise<boolean> {
  if (!/^\d{9}$/.test(cueAnexo)) return false
  if (!await hasBookletCapability(actor, capability, repository)) return false
  if (capability === 'planning') return true
  try {
    return await repository.hasSchoolAssignment(actor!.id, cueAnexo, capability)
  } catch {
    return false
  }
}

/**
 * Evaluates request scope supplied by an internal, transaction-bound query.
 * There is no default reader until the request table is introduced; absent
 * scope evidence therefore cannot grant access.
 */
export async function canAccessRequest(
  actor: SessionUser | null,
  requestId: string,
  capability: BookletCapability,
  repository: BookletRequestPermissionRepository = requestScopeRepository,
): Promise<boolean> {
  if (!actor || actor.banned || requestId.trim() === '') return false
  try {
    const scope = await repository.getRequestSchoolScope(requestId)
    if (!scope) return false
    if (capability === 'planning') return hasBookletCapability(actor, capability, repository)
    const cueAnexo = capability === 'cabecera' ? scope.cabeceraCueAnexo : scope.recipientCueAnexo
    return canAccessSchool(actor, cueAnexo, capability, repository)
  } catch {
    return false
  }
}

const encodeRequestCursor = (cursor: BookletRequestCursor) => Buffer.from(JSON.stringify(cursor)).toString('base64url')

function decodeRequestCursor(value: string | undefined): BookletRequestCursor | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<BookletRequestCursor>
    if (typeof parsed.createdAt !== 'string' || !Number.isFinite(Date.parse(parsed.createdAt))
      || typeof parsed.requestId !== 'string' || !parsed.requestId.trim() || parsed.requestId.length > 128) {
      throw new Error('invalid cursor')
    }
    return { createdAt: new Date(parsed.createdAt).toISOString(), requestId: parsed.requestId }
  } catch {
    throw new BookletRequestReadError('invalid_cursor', 400)
  }
}

/** Returns requests only after deriving and rechecking every row's account scope. */
export async function getBookletRequestPage(
  actor: SessionUser | null,
  query: BookletRequestPageQuery,
  repository: BookletRequestReadRepository = databaseReadRepository,
): Promise<BookletRequestPage> {
  const pageSize = query.limit ?? 50
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new BookletRequestReadError('invalid_page_size', 400)
  const after = decodeRequestCursor(query.cursor)
  const campaignId = query.campaignId?.trim()
  if (query.campaignId !== undefined && (!campaignId || campaignId.length > 128)) throw new BookletRequestReadError('invalid_campaign', 400)

  const capabilityChecks = await Promise.all((['planning', 'cabecera', 'supervisor'] as const).map(async (capability) =>
    await hasBookletCapability(actor, capability, repository) ? capability : null))
  const capabilities = capabilityChecks.filter((value): value is BookletCapability => value !== null)
  if (capabilities.length === 0) throw new BookletRequestReadError('forbidden', 403)

  let campaignOptions: BookletCampaignOption[]
  try { campaignOptions = await repository.listActiveCampaigns() } catch { throw new BookletRequestReadError('request_read_failed', 503) }
  let selectedCampaignId: string | null = null
  if (campaignId) {
    if (!campaignOptions.some((campaign) => campaign.id === campaignId)) throw new BookletRequestReadError('campaign_not_found', 404)
    selectedCampaignId = campaignId
  } else if (campaignOptions.length === 1) {
    selectedCampaignId = campaignOptions[0].id
  } else if (campaignOptions.length > 1) {
    return { campaignId: null, campaignOptions, requests: [], hasMore: false, nextCursor: null }
  } else {
    return { campaignId: null, campaignOptions: [], requests: [], hasMore: false, nextCursor: null }
  }

  const planning = capabilities.includes('planning')
  const [cabeceraCues, supervisorCues] = await Promise.all([
    capabilities.includes('cabecera') ? repository.listAssignedCues(actor!.id, 'cabecera') : Promise.resolve([]),
    capabilities.includes('supervisor') ? repository.listAssignedCues(actor!.id, 'supervisor') : Promise.resolve([]),
  ])
  const scope: BookletRequestReadScope = { planning, cabeceraCues, supervisorCues }
  const visible: BookletRequestReadCandidate[] = []
  const maxScan = 500
  let scanned = 0
  let scanCursor = after
  let moreCandidates = false
  while (scanned < maxScan) {
    const batchSize = Math.min(100, Math.max(pageSize + 1, 20), maxScan - scanned)
    const candidates = await repository.listRequestCandidates({ campaignId: selectedCampaignId, scope, after: scanCursor, limit: batchSize })
    if (candidates.length === 0) {
      moreCandidates = false
      break
    }
    for (const candidate of candidates) {
      scanned += 1
      scanCursor = { createdAt: candidate.createdAt, requestId: candidate.requestId }
      let allowed = false
      for (const capability of capabilities) {
        if (await canAccessRequest(actor, candidate.requestId, capability, repository)) {
          allowed = true
          break
        }
      }
      if (allowed) visible.push(candidate)
      if (visible.length > pageSize) {
        return {
          campaignId: selectedCampaignId, campaignOptions: [], requests: visible.slice(0, pageSize), hasMore: true,
          nextCursor: encodeRequestCursor({ createdAt: visible[pageSize - 1].createdAt, requestId: visible[pageSize - 1].requestId }),
        }
      }
      if (scanned >= maxScan) break
    }
    moreCandidates = candidates.length === batchSize
    if (candidates.length < batchSize || scanned >= maxScan) break
  }

  const hasMore = visible.length > pageSize || moreCandidates
  const lastVisible = visible[pageSize - 1]
  const nextCursor = hasMore ? encodeRequestCursor(lastVisible
    ? { createdAt: lastVisible.createdAt, requestId: lastVisible.requestId }
    : scanCursor ?? { createdAt: new Date(0).toISOString(), requestId: '' }) : null
  return { campaignId: selectedCampaignId, campaignOptions: [], requests: visible.slice(0, pageSize), hasMore, nextCursor }
}

