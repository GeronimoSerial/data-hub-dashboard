import { createHash, randomUUID } from 'node:crypto'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import type { SessionUser } from '@/lib/acl'
import { getDb } from '@/lib/db'
import { describirAuditoria } from '@/lib/infraestructura/auditoria/contexto'
import { bookletProduct, bookletRemito, bookletRemitoItem, bookletRemitoLine, bookletSchoolAssignment } from '@/lib/db/schema'
import { BookletServiceError } from './inventory'
import { hasBookletCapability } from './permissions'
import { assertCampaign, createRemitoRepository, RemitoDispatchError, type RemitoRepository } from './remito-dispatch'

const OPERATION = 'reserva.assign'
const CUE = /^\d{9}$/

export type ReserveBalance = { productId: string; productName: string; received: number; assigned: number; available: number }
export type ReserveAssignment = {
  remitoId: string
  recipientCueAnexo: string
  recipientName: string | null
  dispatchedAt: string
  status: string
  items: Array<{ productId: string; productName: string; quantity: number }>
}
export type ReserveSummary = { campaignId: string; cabeceraCueAnexo: string; balances: ReserveBalance[]; assignments: ReserveAssignment[] }

export type AssignFromReserveInput = {
  campaignId: string
  recipientCueAnexo: string
  items: Array<{ productId: string; quantity: number }>
  idempotencyKey: string
}
export type AssignedFromReserve = {
  remitoId: string
  campaignId: string
  recipientCueAnexo: string
  recipientName: string | null
  dispatchedAt: string
  items: Array<{ productId: string; quantity: number }>
}

export type ReserveRepository = Omit<RemitoRepository, 'transaction'> & {
  transaction<T>(operation: (repository: ReserveRepository) => Promise<T>): Promise<T>
  /** CUEs of the cabecera assignments bound to this account, sorted. `lock` pins the rows for the transaction. */
  findOwnedCabeceras(userId: string, lock?: boolean): Promise<string[]>
  /** Serializes balance changes of one product in one cabecera and campaign. */
  lockReserve(cabeceraCueAnexo: string, campaignId: string, productId: string): Promise<void>
  getReserveBalances(cabeceraCueAnexo: string, campaignId: string): Promise<ReserveBalance[]>
  listAssignments(cabeceraCueAnexo: string, campaignId: string): Promise<ReserveAssignment[]>
}

type Db = Awaited<ReturnType<typeof getDb>>

/** `overrides` apply to the transaction-bound repositories too (used by tests to stub external projections). */
export function createReserveRepository(db: Db, overrides: Partial<ReserveRepository> = {}): ReserveRepository {
  const repository: ReserveRepository = {
    ...createRemitoRepository(db, overrides as Partial<RemitoRepository>),
    async transaction(operation) {
      return db.transaction((tx) => operation(createReserveRepository(tx as unknown as Db, overrides)))
    },
    async findOwnedCabeceras(userId, lock = false) {
      const query = db.select({ cueAnexo: bookletSchoolAssignment.cueAnexo }).from(bookletSchoolAssignment)
        .where(and(eq(bookletSchoolAssignment.relationship, 'cabecera'), eq(bookletSchoolAssignment.cabeceraUserId, userId)))
        .orderBy(bookletSchoolAssignment.cueAnexo)
      return (lock ? await query.for('update') : await query).map((row) => row.cueAnexo)
    },
    async lockReserve(cabeceraCueAnexo, campaignId, productId) {
      await db.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`reserva:${cabeceraCueAnexo}:${campaignId}`}), hashtext(${productId}))`)
    },
    async getReserveBalances(cabeceraCueAnexo, campaignId) {
      const received = await db.select({
        productId: bookletRemitoItem.productId, productName: bookletProduct.name,
        total: sql<number>`coalesce(sum(${bookletRemitoItem.cabeceraReceivedQuantity}), 0)::int`,
      }).from(bookletRemitoItem)
        .innerJoin(bookletRemitoLine, eq(bookletRemitoLine.id, bookletRemitoItem.lineId))
        .innerJoin(bookletRemito, eq(bookletRemito.id, bookletRemitoLine.remitoId))
        .innerJoin(bookletProduct, eq(bookletProduct.id, bookletRemitoItem.productId))
        .where(and(
          eq(bookletRemito.modo, 'cabecera'), eq(bookletRemito.cabeceraCueAnexo, cabeceraCueAnexo), eq(bookletRemito.campaignId, campaignId),
          eq(bookletRemitoLine.reserva, true), sql`${bookletRemitoItem.cabeceraReceivedQuantity} IS NOT NULL`,
        )).groupBy(bookletRemitoItem.productId, bookletProduct.name)
      const assigned = await db.select({
        productId: bookletRemitoItem.productId, productName: bookletProduct.name,
        total: sql<number>`coalesce(sum(${bookletRemitoItem.dispatchedQuantity}), 0)::int`,
      }).from(bookletRemitoItem)
        .innerJoin(bookletRemitoLine, eq(bookletRemitoLine.id, bookletRemitoItem.lineId))
        .innerJoin(bookletRemito, eq(bookletRemito.id, bookletRemitoLine.remitoId))
        .innerJoin(bookletProduct, eq(bookletProduct.id, bookletRemitoItem.productId))
        .where(and(eq(bookletRemito.origenCabeceraCueAnexo, cabeceraCueAnexo), eq(bookletRemito.campaignId, campaignId)))
        .groupBy(bookletRemitoItem.productId, bookletProduct.name)
      const byProduct = new Map<string, ReserveBalance>()
      for (const row of received) byProduct.set(row.productId, { productId: row.productId, productName: row.productName, received: row.total, assigned: 0, available: row.total })
      for (const row of assigned) {
        const entry = byProduct.get(row.productId) ?? { productId: row.productId, productName: row.productName, received: 0, assigned: 0, available: 0 }
        entry.assigned = row.total
        entry.available = entry.received - row.total
        byProduct.set(row.productId, entry)
      }
      return [...byProduct.values()].sort((a, b) => a.productId.localeCompare(b.productId))
    },
    async listAssignments(cabeceraCueAnexo, campaignId) {
      const remitos = await db.select().from(bookletRemito)
        .where(and(eq(bookletRemito.origenCabeceraCueAnexo, cabeceraCueAnexo), eq(bookletRemito.campaignId, campaignId)))
        .orderBy(desc(bookletRemito.dispatchedAt), desc(bookletRemito.id))
      if (remitos.length === 0) return []
      const lines = await db.select().from(bookletRemitoLine).where(inArray(bookletRemitoLine.remitoId, remitos.map((remito) => remito.id)))
      const items = await db.select({
        lineId: bookletRemitoItem.lineId, productId: bookletRemitoItem.productId, productName: bookletProduct.name, quantity: bookletRemitoItem.dispatchedQuantity,
      }).from(bookletRemitoItem).innerJoin(bookletProduct, eq(bookletProduct.id, bookletRemitoItem.productId))
        .where(inArray(bookletRemitoItem.lineId, lines.map((line) => line.id))).orderBy(bookletRemitoItem.productId)
      return remitos.flatMap((remito) => lines.filter((line) => line.remitoId === remito.id).map((line) => ({
        remitoId: remito.id, recipientCueAnexo: line.recipientCueAnexo, recipientName: line.recipientName,
        dispatchedAt: new Date(remito.dispatchedAt).toISOString(), status: line.status,
        items: items.filter((item) => item.lineId === line.id).map(({ productId, productName, quantity }) => ({ productId, productName, quantity })),
      })))
    },
    ...overrides,
  }
  return repository
}

// Resolved on every access: inside cambioAuditado, getDb() returns the audited transaction.
const databaseRepository: ReserveRepository = new Proxy({} as ReserveRepository, {
  get: (_target, key) => Reflect.get(createReserveRepository(getDb()), key),
})

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const forbidden = () => new BookletServiceError('forbidden', 403)

/**
 * The cabecera account that owns the reserve: an active cabecera capability plus the cabecera assignment bound to
 * this very account. Admins and supervisors are deliberately not accepted: nobody authorizes a cabecera's sends.
 */
async function resolveCabecera(actor: SessionUser | null, repository: ReserveRepository, lock: boolean): Promise<string> {
  if (!actor || actor.banned || !await hasBookletCapability(actor, 'cabecera', repository)) throw forbidden()
  const owned = await repository.findOwnedCabeceras(actor.id, lock)
  if (owned.length === 0) throw forbidden()
  if (owned.length > 1) throw new BookletServiceError('cabecera_ambiguous', 409)
  return owned[0]
}

function validate(input: AssignFromReserveInput): void {
  const fail = (code: string) => { throw new BookletServiceError(code, 400) }
  if (typeof input.campaignId !== 'string' || input.campaignId.trim() === '') fail('invalid_campaign')
  if (typeof input.recipientCueAnexo !== 'string' || !CUE.test(input.recipientCueAnexo)) fail('invalid_recipient')
  if (typeof input.idempotencyKey !== 'string' || input.idempotencyKey.trim() === '') fail('invalid_idempotency_key')
  if (!Array.isArray(input.items) || input.items.length === 0) fail('invalid_remito')
  for (const item of input.items) {
    if (typeof item?.productId !== 'string' || item.productId.trim() === '' || !Number.isSafeInteger(item.quantity) || item.quantity <= 0) fail('invalid_quantity')
  }
  if (new Set(input.items.map((item) => item.productId)).size !== input.items.length) fail('invalid_quantity')
}

export async function getReserveSummary(actor: SessionUser | null, campaignId: string, repository: ReserveRepository = databaseRepository): Promise<ReserveSummary> {
  if (typeof campaignId !== 'string' || campaignId.trim() === '') throw new BookletServiceError('invalid_campaign', 400)
  const cabeceraCueAnexo = await resolveCabecera(actor, repository, false)
  const [balances, assignments] = await Promise.all([
    repository.getReserveBalances(cabeceraCueAnexo, campaignId),
    repository.listAssignments(cabeceraCueAnexo, campaignId),
  ])
  return { campaignId, cabeceraCueAnexo, balances, assignments }
}

/**
 * The cabecera sends part of its reserve (quantities Planeamiento dispatched and the cabecera signed for) to one
 * critical school. No supervisor approval, no global stock debit and no stock movement: that stock left at the
 * Planeamiento dispatch. The school confirms through the ordinary school receipt of a directo remito.
 */
export async function assignFromReserve(actor: SessionUser | null, input: AssignFromReserveInput, repository: ReserveRepository = databaseRepository): Promise<AssignedFromReserve> {
  validate(input)
  // Prepared outside the transaction, exactly like dispatchRemito: the projection bootstrap uses a separate connection.
  const geSchema = await repository.prepareCurrentEligibilityProjection?.()
  return repository.transaction(async (tx) => {
    await tx.lockEligibilitySources()
    const cabeceraCueAnexo = await resolveCabecera(actor, tx, true)
    await tx.lockIdempotency(actor!.id, OPERATION, input.idempotencyKey)
    const payload = { campaignId: input.campaignId, recipientCueAnexo: input.recipientCueAnexo, items: input.items.map(({ productId, quantity }) => ({ productId, quantity })) }
    const record = await tx.getIdempotency(actor!.id, OPERATION, input.idempotencyKey)
    if (record) {
      if (record.payloadHash !== hash(payload)) throw new BookletServiceError('idempotency_conflict', 409)
      describirAuditoria({ resultado: 'repetido' })
      return record.response as AssignedFromReserve
    }
    assertCampaign(await tx.getCampaign(input.campaignId))

    const eligibility = await tx.getRecipientEligibility(input.recipientCueAnexo, geSchema)
    if (!eligibility.eligible || eligibility.severity !== 'Crítica') {
      throw new RemitoDispatchError('recipients_not_critical', 409, { recipientCueAnexos: [input.recipientCueAnexo] })
    }

    const products = input.items.map((item) => item.productId).sort()
    for (const productId of products) if (!await tx.productExists(productId)) throw new BookletServiceError('product_not_found', 404)
    // Balances are read only after every lock of this reserve is held, so concurrent sends cannot both pass the check.
    for (const productId of products) await tx.lockReserve(cabeceraCueAnexo, input.campaignId, productId)
    const available = new Map((await tx.getReserveBalances(cabeceraCueAnexo, input.campaignId)).map((balance) => [balance.productId, balance.available]))
    const short = input.items.filter((item) => (available.get(item.productId) ?? 0) < item.quantity).map((item) => item.productId).sort()
    if (short.length > 0) throw new RemitoDispatchError('insufficient_reserve', 409, { productIds: short })

    const remitoId = randomUUID()
    const dispatchedAt = new Date()
    await tx.insertRemito({
      id: remitoId, campaignId: input.campaignId, modo: 'directo', cabeceraCueAnexo: null, origenCabeceraCueAnexo: cabeceraCueAnexo,
      status: 'dispatched', dispatchedByUserId: actor!.id, dispatchedAt,
      lines: [{
        id: randomUUID(), recipientCueAnexo: input.recipientCueAnexo, recipientName: eligibility.name, status: 'in_transit', reserva: false,
        items: input.items.map((item) => ({ productId: item.productId, dispatchedQuantity: item.quantity })),
      }],
    })
    const response: AssignedFromReserve = {
      remitoId, campaignId: input.campaignId, recipientCueAnexo: input.recipientCueAnexo, recipientName: eligibility.name,
      dispatchedAt: dispatchedAt.toISOString(), items: input.items.map(({ productId, quantity }) => ({ productId, quantity })),
    }
    await tx.saveIdempotency(actor!.id, OPERATION, input.idempotencyKey, { payloadHash: hash(payload), response })
    return response
  })
}
