import { createHash, randomUUID } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import {
  bookletCampaign, bookletIdempotency, bookletProduct, bookletQuota, bookletSchoolAssignment,
  bookletStock, bookletStockMovement, bookletMembership, user,
} from '@/lib/db/schema'
import type { SessionUser } from '@/lib/acl'
import { hasBookletCapability, type BookletPermissionRepository } from './permissions'
import { describirAuditoria } from '@/lib/infraestructura/auditoria/contexto'
import type { QuotaInput, QuotaView, StockInput, StockView } from './types'

export class BookletServiceError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, status: number, message = code) {
    super(message)
    this.name = 'BookletServiceError'
    this.code = code
    this.status = status
  }
}

export type CampaignPolicy = {
  status: 'draft' | 'active' | 'closed'
  distributionEnabled: boolean
  overassignmentAllowed: boolean | null
}
export type IdempotencyRecord = { payloadHash: string; response: unknown }

export type InventoryRepository = BookletPermissionRepository & {
  transaction<T>(operation: (repository: InventoryRepository) => Promise<T>): Promise<T>
  getCampaign(campaignId: string): Promise<CampaignPolicy | null>
  productExists(productId: string): Promise<boolean>
  hasStock(campaignId: string, productId: string): Promise<boolean>
  getStock(campaignId: string, productId: string): Promise<number>
  setStock(campaignId: string, productId: string, quantity: number): Promise<void>
  sumQuotas(campaignId: string, productId: string, exceptCabeceraCue?: string): Promise<number>
  getQuota(campaignId: string, productId: string, cabeceraCue: string): Promise<number>
  setQuotaValue(campaignId: string, productId: string, cabeceraCue: string, quantity: number, actorId: string): Promise<void>
  recordStockMovement(movement: { id: string; campaignId: string; productId: string; quantity: number; kind: string; actorUserId: string; idempotencyKey: string }): Promise<void>
  getIdempotency(actorId: string, operation: string, key: string): Promise<IdempotencyRecord | null>
  saveIdempotency(actorId: string, operation: string, key: string, record: IdempotencyRecord): Promise<void>
  isConfirmedCabecera(cueAnexo: string): Promise<boolean>
  lockIdempotency?(actorId: string, operation: string, key: string): Promise<void>
  lockProduct?(campaignId: string, productId: string): Promise<void>
}

const makeDatabaseRepository = (db: Awaited<ReturnType<typeof getDb>>): InventoryRepository => ({
  async transaction(operation) { return db.transaction((tx) => operation(makeDatabaseRepository(tx))) },
  getAccountStatus: async (userId) => {
    const [row] = await db.select({ emailVerified: user.emailVerified, banned: user.banned }).from(user).where(eq(user.id, userId)).limit(1)
    return row ? { emailVerified: row.emailVerified, banned: row.banned === true } : null
  },
  async hasActiveMembership(userId, capability) {
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
  async getStock(campaignId, productId) {
    const [row] = await db.select({ quantity: bookletStock.quantity }).from(bookletStock).where(and(eq(bookletStock.campaignId, campaignId), eq(bookletStock.productId, productId))).limit(1)
    return row?.quantity ?? 0
  },
  async hasStock(campaignId, productId) {
    const [row] = await db.select({ campaignId: bookletStock.campaignId }).from(bookletStock)
      .where(and(eq(bookletStock.campaignId, campaignId), eq(bookletStock.productId, productId))).limit(1)
    return row !== undefined
  },
  async setStock(campaignId, productId, quantity) {
    await db.insert(bookletStock).values({ campaignId, productId, quantity }).onConflictDoUpdate({ target: [bookletStock.campaignId, bookletStock.productId], set: { quantity, updatedAt: new Date() } })
  },
  async sumQuotas(campaignId, productId, exceptCabeceraCue) {
    const rows = await db.select({ quantity: bookletQuota.quantity }).from(bookletQuota).where(and(eq(bookletQuota.campaignId, campaignId), eq(bookletQuota.productId, productId), ...(exceptCabeceraCue ? [sql`${bookletQuota.cabeceraCueAnexo} <> ${exceptCabeceraCue}`] : [])))
    return rows.reduce((sum, row) => sum + row.quantity, 0)
  },
  async getQuota(campaignId, productId, cabeceraCue) {
    const [row] = await db.select({ quantity: bookletQuota.quantity }).from(bookletQuota).where(and(eq(bookletQuota.campaignId, campaignId), eq(bookletQuota.productId, productId), eq(bookletQuota.cabeceraCueAnexo, cabeceraCue))).limit(1)
    return row?.quantity ?? 0
  },
  async setQuotaValue(campaignId, productId, cabeceraCue, quantity, actorId) {
    await db.insert(bookletQuota).values({ campaignId, productId, cabeceraCueAnexo: cabeceraCue, quantity, updatedByUserId: actorId }).onConflictDoUpdate({ target: [bookletQuota.campaignId, bookletQuota.cabeceraCueAnexo, bookletQuota.productId], set: { quantity, updatedByUserId: actorId, updatedAt: new Date() } })
  },
  async recordStockMovement(movement) { await db.insert(bookletStockMovement).values({ ...movement, movement: movement.kind }) },
  async getIdempotency(actorId, operation, key) {
    const [row] = await db.select({ payloadHash: bookletIdempotency.payloadHash, response: bookletIdempotency.responsePayload }).from(bookletIdempotency)
      .where(and(eq(bookletIdempotency.actorUserId, actorId), eq(bookletIdempotency.operation, operation), eq(bookletIdempotency.idempotencyKey, key))).limit(1)
    return row ? { payloadHash: row.payloadHash, response: row.response } : null
  },
  async lockIdempotency(actorId, operation, key) {
    const lockKey = `${operation}:${key}`
    await db.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${actorId}), hashtext(${lockKey}))`)
  },
  async lockProduct(campaignId, productId) {
    await db.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${campaignId}), hashtext(${productId}))`)
  },
  async saveIdempotency(actorId, operation, key, record) {
    await db.insert(bookletIdempotency).values({ actorUserId: actorId, operation, idempotencyKey: key, payloadHash: record.payloadHash, responsePayload: record.response as Record<string, unknown> })
  },
  async isConfirmedCabecera(cueAnexo) {
    const [row] = await db.select({ cueAnexo: bookletSchoolAssignment.cueAnexo }).from(bookletSchoolAssignment)
      .where(and(eq(bookletSchoolAssignment.cueAnexo, cueAnexo), eq(bookletSchoolAssignment.relationship, 'cabecera'))).limit(1)
    return row !== undefined
  },
})

// Se resuelve en cada acceso: dentro de cambioAuditado, getDb() devuelve la transacción del evento.
const databaseRepository: InventoryRepository = new Proxy({} as InventoryRepository, {
  get: (_objetivo, clave) => Reflect.get(makeDatabaseRepository(getDb()), clave),
})

const digest = (input: unknown) => createHash('sha256').update(JSON.stringify(input)).digest('hex')
const positiveInteger = (value: number) => Number.isSafeInteger(value) && value > 0
const nonNegativeInteger = (value: number) => Number.isSafeInteger(value) && value >= 0

function assertPolicy(policy: CampaignPolicy | null): asserts policy is CampaignPolicy {
  if (!policy || policy.status !== 'active') throw new BookletServiceError('campaign_inactive', 409)
  if (!policy.distributionEnabled || policy.overassignmentAllowed === null) throw new BookletServiceError('policy_unresolved', 409)
  if (policy.overassignmentAllowed) throw new BookletServiceError('policy_unresolved', 409)
}

async function getReplay<T>(repo: InventoryRepository, actorId: string, operation: string, key: string, payload: unknown): Promise<T | null> {
  if (!key.trim()) throw new BookletServiceError('invalid_idempotency_key', 400)
  await repo.lockIdempotency?.(actorId, operation, key)
  const prior = await repo.getIdempotency(actorId, operation, key)
  if (!prior) return null
  if (prior.payloadHash !== digest(payload)) throw new BookletServiceError('idempotency_conflict', 409)
  return prior.response as T
}

export async function addStock(actor: SessionUser, input: StockInput, repository = databaseRepository): Promise<StockView> {
  if (!await hasBookletCapability(actor, 'planning', repository)) throw new BookletServiceError('forbidden', 403)
  if (!positiveInteger(input.quantity)) throw new BookletServiceError('invalid_quantity', 400)
  if (!['initial', 'replenishment'].includes(input.movement)) throw new BookletServiceError('invalid_movement', 400)
  return repository.transaction(async (tx) => {
    assertPolicy(await tx.getCampaign(input.campaignId))
    if (!await tx.productExists(input.productId)) throw new BookletServiceError('product_not_found', 404)
    await tx.lockProduct?.(input.campaignId, input.productId)
    const prior = await getReplay<StockView>(tx, actor.id, 'stock.add', input.idempotencyKey, input)
    if (prior) {
      describirAuditoria({ resultado: 'repetido' })
      return prior
    }
    const initialized = await tx.hasStock(input.campaignId, input.productId)
    const stock = await tx.getStock(input.campaignId, input.productId)
    if (input.movement === 'initial' && initialized) throw new BookletServiceError('initial_stock_exists', 409)
    if (input.movement === 'replenishment' && !initialized) throw new BookletServiceError('initial_stock_missing', 409)
    const updated = stock + input.quantity
    if (!Number.isSafeInteger(updated)) throw new BookletServiceError('invalid_quantity', 400)
    await tx.setStock(input.campaignId, input.productId, updated)
    await tx.recordStockMovement({ id: randomUUID(), campaignId: input.campaignId, productId: input.productId, quantity: input.quantity, kind: input.movement, actorUserId: actor.id, idempotencyKey: input.idempotencyKey })
    const response = { campaignId: input.campaignId, productId: input.productId, globalStock: updated }
    await tx.saveIdempotency(actor.id, 'stock.add', input.idempotencyKey, { payloadHash: digest(input), response })
    return response
  })
}

export async function setQuota(actor: SessionUser, input: QuotaInput, repository = databaseRepository): Promise<QuotaView> {
  if (!await hasBookletCapability(actor, 'planning', repository)) throw new BookletServiceError('forbidden', 403)
  if (!nonNegativeInteger(input.quantity)) throw new BookletServiceError('invalid_quantity', 400)
  if (!/^\d{9}$/.test(input.cabeceraCueAnexo)) throw new BookletServiceError('invalid_assignment', 400)
  return repository.transaction(async (tx) => {
    assertPolicy(await tx.getCampaign(input.campaignId))
    if (!await tx.productExists(input.productId)) throw new BookletServiceError('product_not_found', 404)
    await tx.lockProduct?.(input.campaignId, input.productId)
    if (!await tx.isConfirmedCabecera(input.cabeceraCueAnexo)) throw new BookletServiceError('forbidden', 403)
    const stock = await tx.getStock(input.campaignId, input.productId)
    const alreadyAssigned = await tx.sumQuotas(input.campaignId, input.productId, input.cabeceraCueAnexo)
    if (alreadyAssigned + input.quantity > stock) throw new BookletServiceError('quota_exceeds_stock', 409)
    await tx.setQuotaValue(input.campaignId, input.productId, input.cabeceraCueAnexo, input.quantity, actor.id)
    const assigned = await tx.getQuota(input.campaignId, input.productId, input.cabeceraCueAnexo)
    return { campaignId: input.campaignId, cabeceraCueAnexo: input.cabeceraCueAnexo, productId: input.productId, assigned, globalStock: stock, quotaAvailable: assigned }
  })
}

export { databaseRepository as inventoryRepository }
