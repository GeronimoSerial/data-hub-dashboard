import { createHash } from 'node:crypto'
import { and, eq, inArray, sql } from 'drizzle-orm'
import type { SessionUser } from '@/lib/acl'
import { getDb } from '@/lib/db'
import { describirAuditoria } from '@/lib/infraestructura/auditoria/contexto'
import { bookletIdempotency, bookletMembership, bookletProduct, bookletRemito, bookletRemitoItem, bookletRemitoLine, bookletSchoolAssignment, user } from '@/lib/db/schema'
import { normalizeCue } from '@/lib/infraestructura/cue'
import { toDashedCue } from './eligibility'
import { BookletServiceError } from './inventory'

export type ReceiptDb = ReturnType<typeof getDb>
type Tx = Parameters<Parameters<ReceiptDb['transaction']>[0]>[0]

export const OPERATION_CABECERA = 'remito.receive.cabecera'
export const OPERATION_SCHOOL = 'remito.receive.school'
const MAX_REASON_LENGTH = 1000

export type ReceivedItemInput = { productId: string; receivedQuantity: number }
export type CabeceraReceiptInput = {
  idempotencyKey: string
  lines: Array<{ lineId: string; items: ReceivedItemInput[]; shortfallReason?: string }>
}
export type SchoolReceiptInput = { idempotencyKey: string; items: ReceivedItemInput[]; shortfallReason?: string }

export type CabeceraReceiptResult = {
  remitoId: string
  status: 'received'
  signerUserId: string
  receivedAt: string
  lines: Array<{ lineId: string; status: 'at_cabecera' | 'received' | 'closed_empty' }>
}
export type SchoolReceiptResult = { lineId: string; status: 'received'; signerUserId: string; receivedAt: string }

type Signer = { userId: string; name: string }
export type RemitoModo = 'cabecera' | 'directo'
export type CabeceraRemitoView = {
  remitoId: string
  campaignId: string
  modo: RemitoModo
  cabeceraCueAnexo: string | null
  status: 'dispatched' | 'received'
  dispatchedAt: string
  cabeceraReceivedBy: Signer | null
  cabeceraReceivedAt: string | null
  lines: Array<{
    lineId: string
    recipientCueAnexo: string
    recipientName: string | null
    status: string
    cabeceraShortfallReason: string | null
    schoolReceivedBy: Signer | null
    schoolReceivedAt: string | null
    schoolShortfallReason: string | null
    items: Array<{ productId: string; productName: string; dispatchedQuantity: number; cabeceraReceivedQuantity: number | null }>
  }>
}
export type SchoolLineView = {
  lineId: string
  remitoId: string
  modo: RemitoModo
  cabeceraCueAnexo: string | null
  recipientCueAnexo: string
  status: string
  dispatchedAt: string
  cabeceraReceivedBy: Signer | null
  cabeceraReceivedAt: string | null
  cabeceraShortfallReason: string | null
  schoolReceivedBy: Signer | null
  schoolReceivedAt: string | null
  schoolShortfallReason: string | null
  items: Array<{ productId: string; productName: string; expectedQuantity: number | null; schoolReceivedQuantity: number | null }>
}
export type ReceiptListing =
  /** `readOnly`: booklet admins see every remito but only the bound cabecera account can sign. */
  | { kind: 'cabecera'; remitos: CabeceraRemitoView[]; readOnly?: boolean }
  | { kind: 'school'; lines: SchoolLineView[] }

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const iso = (value: Date | string | null): string | null => value === null ? null : new Date(value).toISOString()
const forbidden = () => new BookletServiceError('forbidden', 403)
const isQuantity = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

type AccountLock = { banned: boolean | null } | undefined

/**
 * Global lock order for every receipt transaction: the signer's user row first, then the
 * remito and its lines. Both signing paths follow it, so they cannot wait on each other in a cycle.
 */
async function lockAccount(tx: Tx, actor: SessionUser): Promise<AccountLock> {
  const [account] = await tx.select({ banned: user.banned }).from(user).where(eq(user.id, actor.id)).limit(1).for('update')
  return account
}

/** The signature must come from the responsible, active, non-banned account. */
function assertActiveAccount(actor: SessionUser, account: AccountLock): void {
  if (actor.banned) throw forbidden()
  if (!account || account.banned === true) throw forbidden()
}

async function lockIdempotency(tx: Tx, actorId: string, operation: string, key: string): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${actorId}), hashtext(${`${operation}:${key}`}))`)
}

async function replay<T>(tx: Tx, actorId: string, operation: string, key: string, payload: unknown): Promise<T | null> {
  if (typeof key !== 'string' || !key.trim()) throw new BookletServiceError('invalid_idempotency_key', 400)
  await lockIdempotency(tx, actorId, operation, key)
  const [row] = await tx.select({ payloadHash: bookletIdempotency.payloadHash, response: bookletIdempotency.responsePayload }).from(bookletIdempotency)
    .where(and(eq(bookletIdempotency.actorUserId, actorId), eq(bookletIdempotency.operation, operation), eq(bookletIdempotency.idempotencyKey, key))).limit(1)
  if (!row) return null
  if (row.payloadHash !== hash(payload)) throw new BookletServiceError('idempotency_conflict', 409)
  return row.response as T
}

async function saveIdempotency(tx: Tx, actorId: string, operation: string, key: string, payload: unknown, response: unknown): Promise<void> {
  await tx.insert(bookletIdempotency).values({ actorUserId: actorId, operation, idempotencyKey: key, payloadHash: hash(payload), responsePayload: response as Record<string, unknown> })
}

/** Validates a receipt's quantities against an expected map and returns whether any item is short. */
function checkItems(items: ReceivedItemInput[], expected: Map<string, number>, shortfallReason: string | undefined): { shortfall: boolean; reason: string | null } {
  if (!Array.isArray(items) || items.length !== expected.size) throw new BookletServiceError('invalid_receipt', 400)
  const seen = new Set<string>()
  let shortfall = false
  for (const item of items) {
    if (!expected.has(item.productId) || seen.has(item.productId)) throw new BookletServiceError('invalid_receipt', 400)
    seen.add(item.productId)
    if (!isQuantity(item.receivedQuantity)) throw new BookletServiceError('invalid_quantity', 400)
    const limit = expected.get(item.productId)!
    if (item.receivedQuantity > limit) throw new BookletServiceError('quantity_exceeds_sent', 400)
    if (item.receivedQuantity < limit) shortfall = true
  }
  const reason = typeof shortfallReason === 'string' ? shortfallReason.trim() : ''
  if (shortfall && !reason) throw new BookletServiceError('reason_required', 400)
  // A reason without a shortfall is rejected rather than stored, so a reason always explains a real difference.
  if (!shortfall && shortfallReason !== undefined) throw new BookletServiceError('reason_not_allowed', 400)
  if (reason.length > MAX_REASON_LENGTH) throw new BookletServiceError('invalid_reason', 400)
  return { shortfall, reason: shortfall ? reason : null }
}

export async function receiveRemitoAtCabecera(actor: SessionUser, remitoId: string, input: CabeceraReceiptInput, db: ReceiptDb = getDb()): Promise<CabeceraReceiptResult> {
  return db.transaction(async (tx) => {
    const account = await lockAccount(tx, actor)
    const [remito] = await tx.select().from(bookletRemito).where(eq(bookletRemito.id, remitoId)).limit(1).for('update')
    if (!remito) throw new BookletServiceError('remito_not_found', 404)

    // Admins cannot sign: only the cabecera account bound to this remito, with an active cabecera capability.
    assertActiveAccount(actor, account)
    // A directo remito has no cabecera to sign for it: the same refusal as a non-bound cabecera.
    const cabeceraCue = remito.cabeceraCueAnexo
    if (remito.modo !== 'cabecera' || cabeceraCue === null) throw forbidden()
    const [assignment] = await tx.select({ cabeceraUserId: bookletSchoolAssignment.cabeceraUserId, relationship: bookletSchoolAssignment.relationship })
      .from(bookletSchoolAssignment).where(eq(bookletSchoolAssignment.cueAnexo, cabeceraCue)).limit(1).for('update')
    const [membership] = await tx.select({ id: bookletMembership.id }).from(bookletMembership)
      .where(and(eq(bookletMembership.userId, actor.id), eq(bookletMembership.capability, 'cabecera'), sql`${bookletMembership.revokedAt} IS NULL`)).limit(1).for('update')
    if (!assignment || assignment.relationship !== 'cabecera' || assignment.cabeceraUserId !== actor.id || !membership) throw forbidden()

    const payload = { remitoId, lines: input.lines, idempotencyKey: input.idempotencyKey }
    const replayed = await replay<CabeceraReceiptResult>(tx, actor.id, OPERATION_CABECERA, input.idempotencyKey, payload)
    if (replayed) {
      describirAuditoria({ resultado: 'repetido' })
      return replayed
    }
    if (remito.status !== 'dispatched') throw new BookletServiceError('already_received', 409)

    const lines = await tx.select().from(bookletRemitoLine).where(eq(bookletRemitoLine.remitoId, remitoId)).for('update')
    const items = lines.length ? await tx.select().from(bookletRemitoItem).where(inArray(bookletRemitoItem.lineId, lines.map((line) => line.id))) : []
    if (!Array.isArray(input.lines) || input.lines.length !== lines.length) throw new BookletServiceError('invalid_receipt', 400)
    const submitted = new Map(input.lines.map((line) => [line.lineId, line]))
    if (submitted.size !== lines.length) throw new BookletServiceError('invalid_receipt', 400)

    const receivedAt = new Date()
    const plan: Array<{ line: (typeof lines)[number]; received: ReceivedItemInput[]; reason: string | null; total: number }> = []
    for (const line of lines) {
      const entry = submitted.get(line.id)
      if (!entry) throw new BookletServiceError('invalid_receipt', 400)
      const expected = new Map(items.filter((item) => item.lineId === line.id).map((item) => [item.productId, item.dispatchedQuantity]))
      const { reason } = checkItems(entry.items, expected, entry.shortfallReason)
      plan.push({ line, received: entry.items, reason, total: entry.items.reduce((sum, item) => sum + item.receivedQuantity, 0) })
    }

    const resultLines: CabeceraReceiptResult['lines'] = []
    for (const { line, received, reason, total } of plan) {
      const ownLine = line.recipientCueAnexo === cabeceraCue
      for (const item of received) {
        await tx.update(bookletRemitoItem).set({
          cabeceraReceivedQuantity: item.receivedQuantity,
          ...(ownLine ? { schoolReceivedQuantity: item.receivedQuantity } : {}),
        }).where(and(eq(bookletRemitoItem.lineId, line.id), eq(bookletRemitoItem.productId, item.productId)))
      }
      // "Un solo recibido": the cabecera's own school line is closed by this same signature.
      const status = ownLine ? 'received' : total === 0 ? 'closed_empty' : 'at_cabecera'
      await tx.update(bookletRemitoLine).set({
        status,
        cabeceraShortfallReason: reason,
        ...(ownLine ? { schoolReceivedByUserId: actor.id, schoolReceivedAt: receivedAt } : {}),
      }).where(eq(bookletRemitoLine.id, line.id))
      resultLines.push({ lineId: line.id, status })
    }
    await tx.update(bookletRemito).set({ status: 'received', cabeceraReceivedByUserId: actor.id, cabeceraReceivedAt: receivedAt }).where(eq(bookletRemito.id, remitoId))

    const response: CabeceraReceiptResult = { remitoId, status: 'received', signerUserId: actor.id, receivedAt: receivedAt.toISOString(), lines: resultLines }
    await saveIdempotency(tx, actor.id, OPERATION_CABECERA, input.idempotencyKey, payload, response)
    return response
  })
}

export async function receiveRemitoLineAtSchool(actor: SessionUser, lineId: string, input: SchoolReceiptInput, db: ReceiptDb = getDb()): Promise<SchoolReceiptResult> {
  return db.transaction(async (tx) => {
    const account = await lockAccount(tx, actor)
    const [line] = await tx.select().from(bookletRemitoLine).where(eq(bookletRemitoLine.id, lineId)).limit(1).for('update')
    if (!line) throw new BookletServiceError('line_not_found', 404)

    // Schools sign with their GE SSO account, scoped by the session CUE; booklet memberships do not apply.
    if (actor.role !== 'operador_establecimiento') throw forbidden()
    assertActiveAccount(actor, account)
    const sessionCue = normalizeCue(actor.cueAnexo ?? '')
    if (!sessionCue || sessionCue.kind !== 'anexo' || sessionCue.value !== toDashedCue(line.recipientCueAnexo)) throw forbidden()

    const payload = { lineId, items: input.items, shortfallReason: input.shortfallReason, idempotencyKey: input.idempotencyKey }
    const replayed = await replay<SchoolReceiptResult>(tx, actor.id, OPERATION_SCHOOL, input.idempotencyKey, payload)
    if (replayed) {
      describirAuditoria({ resultado: 'repetido' })
      return replayed
    }
    const [parent] = await tx.select({ modo: bookletRemito.modo }).from(bookletRemito).where(eq(bookletRemito.id, line.remitoId)).limit(1)
    const direct = parent?.modo === 'directo'
    if (!direct && line.status === 'in_transit') throw new BookletServiceError('cabecera_receipt_pending', 409)
    if (line.status !== (direct ? 'in_transit' : 'at_cabecera')) throw new BookletServiceError('already_received', 409)

    // Directo remitos: the school confirms against what Planeamiento dispatched. Lock the remito before
    // reading its sibling lines, so two schools signing at once cannot both miss the other's signature.
    if (direct) await tx.select({ id: bookletRemito.id }).from(bookletRemito).where(eq(bookletRemito.id, line.remitoId)).for('update')

    const items = await tx.select().from(bookletRemitoItem).where(eq(bookletRemitoItem.lineId, lineId))
    const expected = new Map(items.map((item) => [item.productId, direct ? item.dispatchedQuantity : item.cabeceraReceivedQuantity ?? 0]))
    const { reason } = checkItems(input.items, expected, input.shortfallReason)

    const receivedAt = new Date()
    for (const item of input.items) {
      await tx.update(bookletRemitoItem).set({ schoolReceivedQuantity: item.receivedQuantity })
        .where(and(eq(bookletRemitoItem.lineId, lineId), eq(bookletRemitoItem.productId, item.productId)))
    }
    await tx.update(bookletRemitoLine).set({ status: 'received', schoolReceivedByUserId: actor.id, schoolReceivedAt: receivedAt, schoolShortfallReason: reason })
      .where(eq(bookletRemitoLine.id, lineId))
    if (direct) {
      // A directo remito has no cabecera signature: it is received once every school has signed its line.
      const siblings = await tx.select({ status: bookletRemitoLine.status }).from(bookletRemitoLine).where(eq(bookletRemitoLine.remitoId, line.remitoId))
      if (siblings.every((sibling) => sibling.status === 'received' || sibling.status === 'closed_empty')) {
        await tx.update(bookletRemito).set({ status: 'received' }).where(eq(bookletRemito.id, line.remitoId))
      }
    }

    const response: SchoolReceiptResult = { lineId, status: 'received', signerUserId: actor.id, receivedAt: receivedAt.toISOString() }
    await saveIdempotency(tx, actor.id, OPERATION_SCHOOL, input.idempotencyKey, payload, response)
    return response
  })
}

const signer = (userId: string | null, names: Map<string, string>): Signer | null =>
  userId === null ? null : { userId, name: names.get(userId) ?? '' }

async function loadNames(db: ReceiptDb, ids: Array<string | null>): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => id !== null))]
  if (!unique.length) return new Map()
  const rows = await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, unique))
  return new Map(rows.map((row) => [row.id, row.name]))
}

export async function listReceiptsForActor(actor: SessionUser, db: ReceiptDb = getDb()): Promise<ReceiptListing> {
  if (actor.banned) throw forbidden()
  const [account] = await db.select({ banned: user.banned }).from(user).where(eq(user.id, actor.id)).limit(1)
  if (!account || account.banned === true) throw forbidden()

  if (actor.role === 'operador_establecimiento') return listForSchool(actor, db)
  if (actor.role === 'admin') {
    const all = (await db.select({ cueAnexo: bookletRemito.cabeceraCueAnexo }).from(bookletRemito).where(eq(bookletRemito.modo, 'cabecera')))
      .map((row) => row.cueAnexo)
    return { ...await listForCabecera([...new Set(all)].filter((cue): cue is string => cue !== null), db), readOnly: true }
  }

  const cues = (await db.select({ cueAnexo: bookletSchoolAssignment.cueAnexo }).from(bookletSchoolAssignment)
    .where(and(eq(bookletSchoolAssignment.relationship, 'cabecera'), eq(bookletSchoolAssignment.cabeceraUserId, actor.id)))).map((row) => row.cueAnexo)
  const [membership] = await db.select({ id: bookletMembership.id }).from(bookletMembership)
    .where(and(eq(bookletMembership.userId, actor.id), eq(bookletMembership.capability, 'cabecera'), sql`${bookletMembership.revokedAt} IS NULL`)).limit(1)
  if (!membership) throw forbidden()
  // A cabecera membership without a confirmed cabecera school: say what is missing instead of a bare 403.
  if (!cues.length) throw new BookletServiceError('cabecera_not_bound', 403)
  return listForCabecera(cues, db)
}

async function listForCabecera(cues: string[], db: ReceiptDb): Promise<Extract<ReceiptListing, { kind: 'cabecera' }>> {
  const remitos = cues.length ? await db.select().from(bookletRemito)
    .where(and(eq(bookletRemito.modo, 'cabecera'), inArray(bookletRemito.cabeceraCueAnexo, cues))) : []
  const ids = remitos.map((remito) => remito.id)
  const lines = ids.length ? await db.select().from(bookletRemitoLine).where(inArray(bookletRemitoLine.remitoId, ids)) : []
  const items = lines.length ? await db.select({
    lineId: bookletRemitoItem.lineId, productId: bookletRemitoItem.productId, productName: bookletProduct.name,
    dispatchedQuantity: bookletRemitoItem.dispatchedQuantity, cabeceraReceivedQuantity: bookletRemitoItem.cabeceraReceivedQuantity,
  }).from(bookletRemitoItem).innerJoin(bookletProduct, eq(bookletProduct.id, bookletRemitoItem.productId))
    .where(inArray(bookletRemitoItem.lineId, lines.map((line) => line.id))) : []
  const names = await loadNames(db, [...remitos.map((r) => r.cabeceraReceivedByUserId), ...lines.map((l) => l.schoolReceivedByUserId)])
  const views: CabeceraRemitoView[] = remitos.map((remito) => ({
    remitoId: remito.id, campaignId: remito.campaignId, modo: remito.modo as RemitoModo, cabeceraCueAnexo: remito.cabeceraCueAnexo,
    status: remito.status as CabeceraRemitoView['status'], dispatchedAt: iso(remito.dispatchedAt)!,
    cabeceraReceivedBy: signer(remito.cabeceraReceivedByUserId, names), cabeceraReceivedAt: iso(remito.cabeceraReceivedAt),
    lines: lines.filter((line) => line.remitoId === remito.id).sort((a, b) => a.id.localeCompare(b.id)).map((line) => ({
      lineId: line.id, recipientCueAnexo: line.recipientCueAnexo, recipientName: line.recipientName, status: line.status,
      cabeceraShortfallReason: line.cabeceraShortfallReason,
      schoolReceivedBy: signer(line.schoolReceivedByUserId, names), schoolReceivedAt: iso(line.schoolReceivedAt), schoolShortfallReason: line.schoolShortfallReason,
      items: items.filter((item) => item.lineId === line.id).sort((a, b) => a.productId.localeCompare(b.productId))
        .map(({ lineId: _lineId, ...item }) => item),
    })),
  }))
  // Pending (dispatched) first, then history; newest first inside each group.
  views.sort((a, b) => Number(b.status === 'dispatched') - Number(a.status === 'dispatched') || b.dispatchedAt.localeCompare(a.dispatchedAt))
  return { kind: 'cabecera', remitos: views }
}

async function listForSchool(actor: SessionUser, db: ReceiptDb): Promise<ReceiptListing> {
  const cue = normalizeCue(actor.cueAnexo ?? '')
  if (!cue || cue.kind !== 'anexo') throw forbidden()
  const recipient = cue.base + cue.anexo
  const rows = await db.select({ line: bookletRemitoLine, remito: bookletRemito }).from(bookletRemitoLine)
    .innerJoin(bookletRemito, eq(bookletRemito.id, bookletRemitoLine.remitoId))
    .where(eq(bookletRemitoLine.recipientCueAnexo, recipient))
  const items = rows.length ? await db.select({
    lineId: bookletRemitoItem.lineId, productId: bookletRemitoItem.productId, productName: bookletProduct.name,
    dispatchedQuantity: bookletRemitoItem.dispatchedQuantity,
    cabeceraReceivedQuantity: bookletRemitoItem.cabeceraReceivedQuantity, schoolReceivedQuantity: bookletRemitoItem.schoolReceivedQuantity,
  }).from(bookletRemitoItem).innerJoin(bookletProduct, eq(bookletProduct.id, bookletRemitoItem.productId))
    .where(inArray(bookletRemitoItem.lineId, rows.map((row) => row.line.id))) : []
  const names = await loadNames(db, rows.flatMap((row) => [row.remito.cabeceraReceivedByUserId, row.line.schoolReceivedByUserId]))
  const views: SchoolLineView[] = rows.map(({ line, remito }) => ({
    lineId: line.id, remitoId: remito.id, modo: remito.modo as RemitoModo, cabeceraCueAnexo: remito.cabeceraCueAnexo,
    recipientCueAnexo: line.recipientCueAnexo, status: line.status,
    dispatchedAt: iso(remito.dispatchedAt)!,
    cabeceraReceivedBy: signer(remito.cabeceraReceivedByUserId, names), cabeceraReceivedAt: iso(remito.cabeceraReceivedAt),
    cabeceraShortfallReason: line.cabeceraShortfallReason,
    schoolReceivedBy: signer(line.schoolReceivedByUserId, names), schoolReceivedAt: iso(line.schoolReceivedAt), schoolShortfallReason: line.schoolShortfallReason,
    // A cabecera line asks about what the cabecera confirmed; a directo line asks about what Planeamiento dispatched.
    items: items.filter((item) => item.lineId === line.id).sort((a, b) => a.productId.localeCompare(b.productId))
      .map((item) => ({
        productId: item.productId, productName: item.productName,
        expectedQuantity: remito.modo === 'directo' ? item.dispatchedQuantity : item.cabeceraReceivedQuantity,
        schoolReceivedQuantity: item.schoolReceivedQuantity,
      })),
  }))
  // Actionable (at_cabecera, or a directo line in transit) first, then upcoming (in_transit), then history; newest first inside each group.
  const rank = (view: SchoolLineView) => {
    if (view.status === 'at_cabecera' || (view.status === 'in_transit' && view.modo === 'directo')) return 0
    return view.status === 'in_transit' ? 1 : 2
  }
  views.sort((a, b) => rank(a) - rank(b) || b.dispatchedAt.localeCompare(a.dispatchedAt))
  return { kind: 'school', lines: views }
}
