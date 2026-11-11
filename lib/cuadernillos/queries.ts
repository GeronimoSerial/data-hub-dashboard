import { and, eq, gt, isNotNull } from 'drizzle-orm'
import type { SessionUser } from '@/lib/acl'
import { getDb } from '@/lib/db'
import { bookletCampaign, bookletProduct, bookletProductMapping, bookletQuota, bookletSchoolAssignment, bookletStock } from '@/lib/db/schema'
import { getBookletRequestPage, hasBookletCapability } from './permissions'
import type { BookletAssignmentView, BookletAssignmentsPage, BookletBalanceView, BookletCapability, BookletOverview, BookletRequestsPage } from './types'

const DEFAULT_PAGE_SIZE = 25
const MAX_PAGE_SIZE = 50

export type BookletAssignmentsQueryInput = {
  userId: string
  capability: BookletCapability
  cursor: string | null
  limit: number
}

export type BookletAssignmentsQueryRepository = {
  listAssignments(input: BookletAssignmentsQueryInput): Promise<BookletAssignmentView[]>
}

export type BookletAssignmentsQueryOptions = {
  cursor?: string | null
  pageSize?: number
  repository?: BookletAssignmentsQueryRepository
  authorize?: (actor: SessionUser | null, capability: BookletCapability) => Promise<boolean>
}

const databaseRepository: BookletAssignmentsQueryRepository = {
  async listAssignments({ userId, capability, cursor, limit }) {
    const scope = capability === 'planning'
      ? isNotNull(bookletSchoolAssignment.cueAnexo)
      : eq(
          capability === 'cabecera'
            ? bookletSchoolAssignment.cabeceraUserId
            : bookletSchoolAssignment.supervisorUserId,
          userId,
        )
    const conditions = [scope]
    if (cursor) conditions.push(gt(bookletSchoolAssignment.cueAnexo, cursor))

    const rows = await getDb().select({
      cueAnexo: bookletSchoolAssignment.cueAnexo,
      schoolName: bookletSchoolAssignment.schoolName,
      relationship: bookletSchoolAssignment.relationship,
      cabeceraCueAnexo: bookletSchoolAssignment.cabeceraCue,
      supervisorName: bookletSchoolAssignment.supervisorName,
    })
      .from(bookletSchoolAssignment)
      .where(and(...conditions))
      .orderBy(bookletSchoolAssignment.cueAnexo)
      .limit(limit)

    return rows.flatMap((row) => row.relationship === 'cabecera' || row.relationship === 'dependiente'
      ? [{ ...row, relationship: row.relationship }]
      : [])
  },
}

/** Returns assignments only after a fresh account-bound module capability check. */
export async function getBookletAssignmentsPage(
  actor: SessionUser | null,
  capability: BookletCapability,
  options: BookletAssignmentsQueryOptions = {},
): Promise<BookletAssignmentsPage | null> {
  if (!actor || actor.banned) return null
  const authorize = options.authorize ?? hasBookletCapability
  if (!await authorize(actor, capability)) return null

  const pageSize = Number.isInteger(options.pageSize) && options.pageSize! > 0
    ? Math.min(options.pageSize!, MAX_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE
  const cursor = options.cursor ?? null
  if (cursor !== null && !/^\d{9}$/.test(cursor)) return null

  const repository = options.repository ?? databaseRepository
  const rows = await repository.listAssignments({
    userId: actor.id,
    capability,
    cursor,
    limit: pageSize + 1,
  })
  const items = rows.slice(0, pageSize)
  return {
    items,
    nextCursor: rows.length > pageSize ? items.at(-1)?.cueAnexo ?? null : null,
  }
}

export type BookletOverviewBalanceInput = {
  userId: string
  capability: BookletCapability
  campaignId: string
}

export type BookletOverviewQueryRepository = {
  listActiveCampaigns(): Promise<BookletOverview['campaignOptions']>
  listBalances(input: BookletOverviewBalanceInput): Promise<BookletBalanceView[]>
}

export type BookletOverviewRequestQuery = {
  campaignId?: string
  limit: 1
}

export type BookletOverviewQueryOptions = {
  campaignId?: string
  repository?: BookletOverviewQueryRepository
  authorize?: (actor: SessionUser | null, capability: BookletCapability) => Promise<boolean>
  loadRequests?: (actor: SessionUser | null, query: BookletOverviewRequestQuery) => Promise<BookletRequestsPage>
}

const databaseOverviewRepository: BookletOverviewQueryRepository = {
  async listActiveCampaigns() {
    return getDb().select({
      id: bookletCampaign.id,
      name: bookletCampaign.name,
      distributionEnabled: bookletCampaign.distributionEnabled,
      overassignmentAllowed: bookletCampaign.overassignmentAllowed,
    }).from(bookletCampaign).where(eq(bookletCampaign.status, 'active')).orderBy(bookletCampaign.name, bookletCampaign.id)
  },
  async listBalances({ userId, capability, campaignId }) {
    if (capability === 'supervisor') return []

    const db = getDb()
    const [products, assignments, stockRows, quotaRows] = await Promise.all([
      db.select({ productId: bookletProduct.id, productLabel: bookletProduct.name })
        .from(bookletProduct)
        .innerJoin(bookletProductMapping, eq(bookletProductMapping.productId, bookletProduct.id))
        .orderBy(bookletProduct.name, bookletProduct.id),
      (capability === 'planning'
        ? db.select({ cueAnexo: bookletSchoolAssignment.cueAnexo, schoolName: bookletSchoolAssignment.schoolName })
          .from(bookletSchoolAssignment).where(eq(bookletSchoolAssignment.relationship, 'cabecera'))
        : db.select({ cueAnexo: bookletSchoolAssignment.cueAnexo, schoolName: bookletSchoolAssignment.schoolName })
          .from(bookletSchoolAssignment).where(and(
            eq(bookletSchoolAssignment.relationship, 'cabecera'),
            eq(bookletSchoolAssignment.cabeceraUserId, userId),
          ))),
      capability === 'planning'
        ? db.select({ productId: bookletStock.productId, quantity: bookletStock.quantity })
          .from(bookletStock).where(eq(bookletStock.campaignId, campaignId))
        : Promise.resolve([] as { productId: string; quantity: number }[]),
      db.select({ productId: bookletQuota.productId, cabeceraCueAnexo: bookletQuota.cabeceraCueAnexo, quantity: bookletQuota.quantity })
        .from(bookletQuota).where(eq(bookletQuota.campaignId, campaignId)),
    ])

    const stockByProduct = new Map(stockRows.map((row) => [row.productId, row.quantity]))
    const quotaByHeadAndProduct = new Map(quotaRows.map((row) => [`${row.cabeceraCueAnexo}:${row.productId}`, row.quantity]))
    const balances: BookletBalanceView[] = []
    for (const product of products) {
      if (assignments.length === 0) {
        if (capability === 'planning') balances.push({
          productId: product.productId, productLabel: product.productLabel,
          globalAvailable: stockByProduct.get(product.productId) ?? null,
          quotaAssigned: null, quotaAvailable: null, cabeceraCueAnexo: null, cabeceraName: null,
        })
        continue
      }
      for (const assignment of assignments) balances.push({
        productId: product.productId,
        productLabel: product.productLabel,
        globalAvailable: capability === 'planning' ? stockByProduct.get(product.productId) ?? null : null,
        quotaAssigned: null,
        quotaAvailable: quotaByHeadAndProduct.get(`${assignment.cueAnexo}:${product.productId}`) ?? 0,
        cabeceraCueAnexo: assignment.cueAnexo,
        cabeceraName: assignment.schoolName,
      })
    }
    return balances
  },
}

/** Returns only explicitly mapped products and balances scoped by the requested module capability. */
export async function getBookletOverviewPage(
  actor: SessionUser | null,
  capability: BookletCapability,
  options: BookletOverviewQueryOptions = {},
): Promise<BookletOverview | null> {
  if (!actor || actor.banned) return null
  const authorize = options.authorize ?? hasBookletCapability
  if (!await authorize(actor, capability)) return null

  const loadRequests = options.loadRequests ?? getBookletRequestPage
  const requestPage = await loadRequests(actor, {
    campaignId: options.campaignId,
    limit: 1,
  })
  const selectedCampaignId = requestPage.campaignId
  const repository = options.repository ?? databaseOverviewRepository
  const campaignOptions = selectedCampaignId
    ? await repository.listActiveCampaigns()
    : requestPage.campaignOptions
  const balances = selectedCampaignId
    ? await repository.listBalances({
        userId: actor.id,
        capability,
        campaignId: selectedCampaignId,
      })
    : []

  return {
    capability,
    campaignId: selectedCampaignId,
    campaignOptions,
    balances,
    // Request pagination uses the dedicated endpoint whose scope is independently checked per request.
    requests: [],
    eligibility: null,
    hasMore: false,
    nextCursor: null,
  }
}
