import { randomUUID } from 'node:crypto'
import { and, desc, eq, exists, inArray, lt, or, sql, type SQL } from 'drizzle-orm'
import type { SessionUser } from '@/lib/acl'
import { getDb } from '@/lib/db'
import {
  bookletRemito, bookletRemitoItem, bookletRemitoLine, bookletRemitoObservation,
  bookletSchoolAssignment, bookletProduct, user,
} from '@/lib/db/schema'
import { createApprovalRepository } from './approvals'
import { BookletServiceError } from './inventory'
import { hasBookletCapability, isBookletAdmin } from './permissions'

export type RemitoControlQuery = { campaignId?: string; onlyWithShortfall?: boolean; cursor?: string; limit?: number }

export type RemitoControlItem = {
  productId: string
  productLabel: string
  dispatched: number
  cabeceraReceived: number | null
  schoolReceived: number | null
  /** dispatched - cabeceraReceived; null until the cabecera signs. */
  planningToCabeceraShortfall: number | null
  /**
   * School-leg shortfall; null until the school signs. For cabecera remitos it is
   * cabeceraReceived - schoolReceived. Direct remitos have no cabecera leg, so their
   * school leg is measured from dispatched: dispatched - schoolReceived.
   */
  cabeceraToSchoolShortfall: number | null
}

export type RemitoControlObservation = {
  id: string
  lineId: string | null
  authorUserId: string
  authorName: string
  body: string
  createdAt: string
}

export type RemitoControlLine = {
  lineId: string
  recipientCueAnexo: string
  recipientName: string | null
  status: string
  /** A reserve line stays at the cabecera: its quantities are split among schools through onward remitos. */
  reserva: boolean
  schoolReceivedByUserId: string | null
  schoolReceivedByName: string | null
  schoolReceivedAt: string | null
  cabeceraShortfallReason: string | null
  schoolShortfallReason: string | null
  items: RemitoControlItem[]
}

export type RemitoControlRemito = {
  remitoId: string
  campaignId: string
  modo: 'cabecera' | 'directo'
  /** Null for direct remitos, which have no cabecera. */
  cabeceraCueAnexo: string | null
  cabeceraName: string | null
  /** Set on a directo remito that a cabecera sent out of its reserve (read-only for the supervisor). */
  origenCabeceraCueAnexo: string | null
  origenCabeceraName: string | null
  status: string
  dispatchedByUserId: string
  dispatchedByName: string
  dispatchedAt: string
  cabeceraReceivedByUserId: string | null
  cabeceraReceivedByName: string | null
  cabeceraReceivedAt: string | null
  lines: RemitoControlLine[]
  observations: RemitoControlObservation[]
  hasShortfall: boolean
}

export type RemitoControlSummary = {
  /** Cabecera remitos still waiting for the cabecera to sign. Direct remitos never count here. */
  remitosPendingCabeceraReceipt: number
  /**
   * Lines still waiting for the school: cabecera-confirmed lines (`at_cabecera`) plus the
   * `in_transit` lines of direct remitos.
   */
  linesPendingSchoolReceipt: number
  planningToCabeceraShortfallUnits: number
  /**
   * Shortfall on the school leg. It counts the cabecera-to-school leg of cabecera remitos
   * and the Planeamiento-to-school leg of direct remitos, which is measured from dispatched.
   */
  cabeceraToSchoolShortfallUnits: number
}

export type RemitoControlPage = {
  summary: RemitoControlSummary
  remitos: RemitoControlRemito[]
  hasMore: boolean
  nextCursor: string | null
}

type Db = ReturnType<typeof getDb>
type Cursor = { dispatchedAt: string; remitoId: string }

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100
const MAX_BODY = 2000
const iso = (value: Date | string | null): string | null => value === null ? null : new Date(value).toISOString()

const encodeCursor = (cursor: Cursor) => Buffer.from(JSON.stringify(cursor)).toString('base64url')
function decodeCursor(value: string | undefined): Cursor | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<Cursor>
    if (typeof parsed.dispatchedAt !== 'string' || !Number.isFinite(Date.parse(parsed.dispatchedAt))
      || typeof parsed.remitoId !== 'string' || !parsed.remitoId.trim() || parsed.remitoId.length > 128) throw new Error('invalid')
    return { dispatchedAt: new Date(parsed.dispatchedAt).toISOString(), remitoId: parsed.remitoId }
  } catch {
    throw new BookletServiceError('invalid_cursor', 400)
  }
}

// What the school leg hands over: the cabecera's receipt, or the dispatched quantity for a direct remito.
// Requires bookletRemito in scope (the outer query or the correlated exists below).
const schoolLegBaseSql = sql`(CASE WHEN ${bookletRemito.modo} = 'directo' THEN ${bookletRemitoItem.dispatchedQuantity}
  ELSE ${bookletRemitoItem.cabeceraReceivedQuantity} END)`

// A remito has a shortfall when any item was confirmed below what the previous leg handed over.
const itemShortfallSql = sql`(${bookletRemitoItem.cabeceraReceivedQuantity} < ${bookletRemitoItem.dispatchedQuantity}
  OR ${bookletRemitoItem.schoolReceivedQuantity} < ${schoolLegBaseSql})`

/**
 * Supervisor "solo control posterior" view: the chain of custody of the remitos of
 * the supervisor's own cabeceras. Read-only; booklet admins see everything.
 * An out-of-scope supervisor sees an empty page, never another supervisor's data.
 */
export async function getSupervisorControl(actor: SessionUser | null, query: RemitoControlQuery = {}): Promise<RemitoControlPage> {
  const db = getDb()
  const limit = query.limit ?? DEFAULT_LIMIT
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) throw new BookletServiceError('invalid_page_size', 400)
  const after = decodeCursor(query.cursor)
  const admin = await isBookletAdmin(actor)
  if (!admin && !await hasBookletCapability(actor, 'supervisor')) throw new BookletServiceError('forbidden', 403)

  const scope: SQL[] = []
  if (query.campaignId) scope.push(eq(bookletRemito.campaignId, query.campaignId))
  if (!admin) {
    // Planeamiento's direct remitos have no cabecera, so they stay out. The onward remitos a supervised
    // cabecera sends from its reserve (`origen`) are included: the supervisor reviews them afterwards.
    const supervised = () => db.select({ cue: bookletSchoolAssignment.cueAnexo }).from(bookletSchoolAssignment)
      .where(and(eq(bookletSchoolAssignment.relationship, 'cabecera'), eq(bookletSchoolAssignment.supervisorUserId, actor!.id)))
    scope.push(or(
      and(eq(bookletRemito.modo, 'cabecera'), inArray(bookletRemito.cabeceraCueAnexo, supervised())),
      and(eq(bookletRemito.modo, 'directo'), inArray(bookletRemito.origenCabeceraCueAnexo, supervised())),
    )!)
  }
  const scoped = scope.length ? and(...scope) : undefined

  const summary = await computeSummary(db, scoped)

  const page: SQL[] = scope.slice()
  if (query.onlyWithShortfall) {
    page.push(exists(
      db.select({ one: sql`1` }).from(bookletRemitoItem)
        .innerJoin(bookletRemitoLine, eq(bookletRemitoLine.id, bookletRemitoItem.lineId))
        .where(and(eq(bookletRemitoLine.remitoId, bookletRemito.id), itemShortfallSql)),
    ))
  }
  if (after) {
    const at = new Date(after.dispatchedAt)
    page.push(or(lt(bookletRemito.dispatchedAt, at), and(eq(bookletRemito.dispatchedAt, at), lt(bookletRemito.id, after.remitoId)))!)
  }
  const rows = await db.select().from(bookletRemito).where(page.length ? and(...page) : undefined)
    .orderBy(desc(bookletRemito.dispatchedAt), desc(bookletRemito.id)).limit(limit + 1)
  const hasMore = rows.length > limit
  const pageRows = rows.slice(0, limit)
  const remitos = await hydrate(db, pageRows)
  const last = pageRows[pageRows.length - 1]
  return {
    summary, remitos, hasMore,
    nextCursor: hasMore && last ? encodeCursor({ dispatchedAt: new Date(last.dispatchedAt).toISOString(), remitoId: last.id }) : null,
  }
}

async function computeSummary(db: Db, scoped: SQL | undefined): Promise<RemitoControlSummary> {
  const withRemito = (status: SQL) => and(scoped, status)
  const [[pendingRemitos], [pendingLines], [shortfalls]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(bookletRemito)
      .where(withRemito(and(eq(bookletRemito.status, 'dispatched'), eq(bookletRemito.modo, 'cabecera'))!)),
    db.select({ n: sql<number>`count(*)::int` }).from(bookletRemitoLine)
      .innerJoin(bookletRemito, eq(bookletRemito.id, bookletRemitoLine.remitoId))
      .where(withRemito(or(
        // A reserve line waits at the cabecera for good: no school signs it.
        and(eq(bookletRemitoLine.status, 'at_cabecera'), eq(bookletRemitoLine.reserva, false)),
        and(eq(bookletRemitoLine.status, 'in_transit'), eq(bookletRemito.modo, 'directo')),
      )!)),
    db.select({
      // Direct remitos have no cabecera leg: only cabecera remitos contribute here.
      toCabecera: sql<number>`coalesce(sum(CASE WHEN ${bookletRemito.modo} = 'cabecera'
        THEN ${bookletRemitoItem.dispatchedQuantity} - ${bookletRemitoItem.cabeceraReceivedQuantity} END), 0)::int`,
      toSchool: sql<number>`coalesce(sum(${schoolLegBaseSql} - ${bookletRemitoItem.schoolReceivedQuantity}), 0)::int`,
    }).from(bookletRemitoItem)
      .innerJoin(bookletRemitoLine, eq(bookletRemitoLine.id, bookletRemitoItem.lineId))
      .innerJoin(bookletRemito, eq(bookletRemito.id, bookletRemitoLine.remitoId))
      .where(scoped),
  ])
  return {
    remitosPendingCabeceraReceipt: pendingRemitos?.n ?? 0,
    linesPendingSchoolReceipt: pendingLines?.n ?? 0,
    planningToCabeceraShortfallUnits: shortfalls?.toCabecera ?? 0,
    cabeceraToSchoolShortfallUnits: shortfalls?.toSchool ?? 0,
  }
}

async function hydrate(db: Db, remitos: Array<typeof bookletRemito.$inferSelect>): Promise<RemitoControlRemito[]> {
  if (remitos.length === 0) return []
  const remitoIds = remitos.map((remito) => remito.id)
  const [lines, observations] = await Promise.all([
    db.select().from(bookletRemitoLine).where(inArray(bookletRemitoLine.remitoId, remitoIds)).orderBy(bookletRemitoLine.recipientCueAnexo),
    db.select().from(bookletRemitoObservation).where(inArray(bookletRemitoObservation.remitoId, remitoIds))
      .orderBy(bookletRemitoObservation.createdAt, bookletRemitoObservation.id),
  ])
  const lineIds = lines.map((line) => line.id)
  const items = lineIds.length
    ? await db.select({
      lineId: bookletRemitoItem.lineId, productId: bookletRemitoItem.productId, productLabel: bookletProduct.name,
      dispatched: bookletRemitoItem.dispatchedQuantity, cabeceraReceived: bookletRemitoItem.cabeceraReceivedQuantity,
      schoolReceived: bookletRemitoItem.schoolReceivedQuantity,
    }).from(bookletRemitoItem).innerJoin(bookletProduct, eq(bookletProduct.id, bookletRemitoItem.productId))
      .where(inArray(bookletRemitoItem.lineId, lineIds)).orderBy(bookletProduct.levelCode, bookletProduct.gradeCode, bookletProduct.id)
    : []

  const userIds = [...new Set([
    ...remitos.flatMap((r) => [r.dispatchedByUserId, r.cabeceraReceivedByUserId]),
    ...lines.map((l) => l.schoolReceivedByUserId),
    ...observations.map((o) => o.authorUserId),
  ].filter((id): id is string => id !== null))]
  const cues = [...new Set(remitos.flatMap((r) => [r.cabeceraCueAnexo, r.origenCabeceraCueAnexo].filter((cue): cue is string => cue !== null)))]
  const [users, schools] = await Promise.all([
    db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, userIds)),
    db.select({ cue: bookletSchoolAssignment.cueAnexo, name: bookletSchoolAssignment.schoolName }).from(bookletSchoolAssignment)
      .where(inArray(bookletSchoolAssignment.cueAnexo, cues)),
  ])
  const userName = new Map(users.map((u) => [u.id, u.name]))
  const schoolName = new Map(schools.map((s) => [s.cue, s.name]))
  const directRemitoIds = new Set(remitos.filter((r) => r.modo === 'directo').map((r) => r.id))
  const directLineIds = new Set(lines.filter((l) => directRemitoIds.has(l.remitoId)).map((l) => l.id))

  const itemsByLine = new Map<string, RemitoControlItem[]>()
  for (const item of items) {
    const schoolLegBase = directLineIds.has(item.lineId) ? item.dispatched : item.cabeceraReceived
    const entry: RemitoControlItem = {
      productId: item.productId, productLabel: item.productLabel, dispatched: item.dispatched,
      cabeceraReceived: item.cabeceraReceived, schoolReceived: item.schoolReceived,
      planningToCabeceraShortfall: item.cabeceraReceived === null ? null : item.dispatched - item.cabeceraReceived,
      cabeceraToSchoolShortfall: schoolLegBase === null || item.schoolReceived === null ? null : schoolLegBase - item.schoolReceived,
    }
    itemsByLine.set(item.lineId, [...(itemsByLine.get(item.lineId) ?? []), entry])
  }
  const linesByRemito = new Map<string, RemitoControlLine[]>()
  for (const line of lines) {
    const entry: RemitoControlLine = {
      lineId: line.id, recipientCueAnexo: line.recipientCueAnexo, recipientName: line.recipientName, status: line.status, reserva: line.reserva,
      schoolReceivedByUserId: line.schoolReceivedByUserId,
      schoolReceivedByName: line.schoolReceivedByUserId ? userName.get(line.schoolReceivedByUserId) ?? null : null,
      schoolReceivedAt: iso(line.schoolReceivedAt),
      cabeceraShortfallReason: line.cabeceraShortfallReason, schoolShortfallReason: line.schoolShortfallReason,
      items: itemsByLine.get(line.id) ?? [],
    }
    linesByRemito.set(line.remitoId, [...(linesByRemito.get(line.remitoId) ?? []), entry])
  }
  const observationsByRemito = new Map<string, RemitoControlObservation[]>()
  for (const o of observations) {
    const entry: RemitoControlObservation = {
      id: o.id, lineId: o.lineId, authorUserId: o.authorUserId, authorName: userName.get(o.authorUserId) ?? '',
      body: o.body, createdAt: new Date(o.createdAt).toISOString(),
    }
    observationsByRemito.set(o.remitoId, [...(observationsByRemito.get(o.remitoId) ?? []), entry])
  }
  return remitos.map((remito) => {
    const remitoLines = linesByRemito.get(remito.id) ?? []
    return {
      remitoId: remito.id, campaignId: remito.campaignId, modo: remito.modo as RemitoControlRemito['modo'],
      cabeceraCueAnexo: remito.cabeceraCueAnexo,
      cabeceraName: remito.cabeceraCueAnexo === null ? null : schoolName.get(remito.cabeceraCueAnexo) ?? '',
      origenCabeceraCueAnexo: remito.origenCabeceraCueAnexo,
      origenCabeceraName: remito.origenCabeceraCueAnexo === null ? null : schoolName.get(remito.origenCabeceraCueAnexo) ?? '',
      status: remito.status,
      dispatchedByUserId: remito.dispatchedByUserId, dispatchedByName: userName.get(remito.dispatchedByUserId) ?? '',
      dispatchedAt: new Date(remito.dispatchedAt).toISOString(),
      cabeceraReceivedByUserId: remito.cabeceraReceivedByUserId,
      cabeceraReceivedByName: remito.cabeceraReceivedByUserId ? userName.get(remito.cabeceraReceivedByUserId) ?? null : null,
      cabeceraReceivedAt: iso(remito.cabeceraReceivedAt),
      lines: remitoLines,
      observations: observationsByRemito.get(remito.id) ?? [],
      hasShortfall: remitoLines.some((line) => line.items.some((item) =>
        (item.planningToCabeceraShortfall ?? 0) > 0 || (item.cabeceraToSchoolShortfall ?? 0) > 0)),
    }
  })
}

/**
 * Cabecera remitos: only the supervisor assigned to their cabecera. Direct remitos have
 * no cabecera and so no assigned supervisor: only booklet admins may observe them.
 */
async function mayObserve(db: Db, actor: SessionUser, admin: boolean, remito: { cabecera: string | null; modo: string }): Promise<boolean> {
  if (remito.modo === 'directo') return admin
  if (admin || remito.cabecera === null) return false
  if (!await hasBookletCapability(actor, 'supervisor')) return false
  return createApprovalRepository(db).isAssignedSupervisor(actor.id, remito.cabecera)
}

export type RemitoObservationInput = { lineId?: string; body: string }
export type RemitoObservationResult = RemitoControlObservation & { remitoId: string }

/**
 * Appends a supervisor observation. Only the supervisor assigned to the remito's
 * cabecera may author one; booklet admins are deliberately excluded so responsibility
 * stays on the supervisor account. Observations are append-only: there is no edit or
 * delete path, and they never touch quantities or remito status.
 */
export async function addRemitoObservation(actor: SessionUser, remitoId: string, input: RemitoObservationInput): Promise<RemitoObservationResult> {
  const db = getDb()
  const admin = await isBookletAdmin(actor)
  const [remito] = await db.select({ id: bookletRemito.id, cabecera: bookletRemito.cabeceraCueAnexo, modo: bookletRemito.modo })
    .from(bookletRemito).where(eq(bookletRemito.id, remitoId)).limit(1)
  // Unknown and out-of-scope remitos answer identically so ids cannot be probed.
  if (!remito || !await mayObserve(db, actor, admin, remito)) throw new BookletServiceError('forbidden', 403)
  const body = typeof input.body === 'string' ? input.body.trim() : ''
  if (body.length < 1 || body.length > MAX_BODY) throw new BookletServiceError('invalid_observation', 400)
  let lineId: string | null = null
  if (input.lineId !== undefined) {
    const [line] = await db.select({ id: bookletRemitoLine.id }).from(bookletRemitoLine)
      .where(and(eq(bookletRemitoLine.id, input.lineId), eq(bookletRemitoLine.remitoId, remito.id))).limit(1)
    if (!line) throw new BookletServiceError('invalid_line', 400)
    lineId = line.id
  }
  const [row] = await db.insert(bookletRemitoObservation)
    .values({ id: randomUUID(), remitoId: remito.id, lineId, authorUserId: actor.id, body })
    .returning()
  const [author] = await db.select({ name: user.name }).from(user).where(eq(user.id, actor.id)).limit(1)
  return {
    id: row.id, remitoId: row.remitoId, lineId: row.lineId, authorUserId: row.authorUserId,
    authorName: author?.name ?? '', body: row.body, createdAt: new Date(row.createdAt).toISOString(),
  }
}
