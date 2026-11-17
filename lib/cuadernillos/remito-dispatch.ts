import { createHash, randomUUID } from 'node:crypto'
import { and, desc, eq, inArray, lt, or } from 'drizzle-orm'
import type { SessionUser } from '@/lib/acl'
import { getDb } from '@/lib/db'
import { describirAuditoria } from '@/lib/infraestructura/auditoria/contexto'
import { bookletProduct, bookletRemito, bookletRemitoItem, bookletRemitoLine, bookletStockMovement, user } from '@/lib/db/schema'
import { crearEjecutorSql, type GeSchemaReady } from '@/lib/infraestructura/ge-db'
import { listarPartesVigentes } from '@/lib/infraestructura/parte-mapa'
import { createApprovalRepository, type ApprovalRepository } from './approvals'
import { getSchoolEligibilityWithName, toDashedCue } from './eligibility'
import { BookletServiceError, type CampaignPolicy } from './inventory'
import { hasBookletCapability } from './permissions'
import type { Eligibility } from './types'

const DISPATCH_OPERATION = 'remito.dispatch'
const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100

export type RemitoModo = 'cabecera' | 'directo'

export type DispatchRemitoInput = {
  campaignId: string
  /** Missing means 'cabecera'. A 'directo' remito goes straight to its schools and must not carry a cabecera. */
  modo?: RemitoModo
  cabeceraCueAnexo?: string
  idempotencyKey: string
  lines: Array<{ recipientCueAnexo: string; items: Array<{ productId: string; quantity: number }> }>
}

export type DispatchedRemito = {
  remitoId: string
  campaignId: string
  modo: RemitoModo
  cabeceraCueAnexo: string | null
  status: 'dispatched'
  dispatchedAt: string
  lines: Array<{
    recipientCueAnexo: string
    recipientName: string | null
    status: 'in_transit'
    items: Array<{ productId: string; quantity: number }>
  }>
}

export type StoredRemitoItem = { productId: string; dispatchedQuantity: number; cabeceraReceivedQuantity?: number | null; schoolReceivedQuantity?: number | null }
export type StoredRemitoLine = {
  id: string
  recipientCueAnexo: string
  recipientName: string | null
  status: 'in_transit' | 'at_cabecera' | 'received' | 'closed_empty'
  items: StoredRemitoItem[]
}
export type RemitoSigner = { userId: string; name: string }
export type RemitoRow = {
  remitoId: string
  campaignId: string
  modo: RemitoModo
  cabeceraCueAnexo: string | null
  status: 'dispatched' | 'received'
  dispatchedByUserId: string
  dispatchedAt: Date
  cabeceraReceivedAt: Date | null
  cabeceraReceivedBy: RemitoSigner | null
  lines: Array<Omit<StoredRemitoLine, 'id' | 'items'> & {
    lineId?: string
    cabeceraShortfallReason: string | null
    schoolShortfallReason: string | null
    schoolReceivedBy: RemitoSigner | null
    schoolReceivedAt: Date | null
    items: Array<Required<StoredRemitoItem> & { productName: string }>
  }>
}
export type RemitoCursor = { dispatchedAt: Date; remitoId: string }
export type RemitoListQuery = { campaignId?: string; after: RemitoCursor | null; limit: number }

export type RemitoRepository = Pick<ApprovalRepository,
  | 'prepareCurrentEligibilityProjection' | 'lockEligibilitySources' | 'lockIdempotency' | 'lockProduct'
  | 'getAccountStatus' | 'hasActiveMembership' | 'hasSchoolAssignment' | 'getCampaign' | 'approvalAuthorityReady'
  | 'productExists' | 'getStock' | 'debitStock' | 'getIdempotency' | 'saveIdempotency'
> & {
  transaction<T>(operation: (repository: RemitoRepository) => Promise<T>): Promise<T>
  getRecipientEligibility(cueAnexo: string, geSchema?: GeSchemaReady): Promise<Eligibility & { name: string | null }>
  recordDispatchMovement(input: { campaignId: string; productId: string; remitoId: string; quantity: number; actorUserId: string; idempotencyKey: string }): Promise<void>
  insertRemito(remito: {
    id: string; campaignId: string; modo: RemitoModo; cabeceraCueAnexo: string | null; status: 'dispatched'
    dispatchedByUserId: string; dispatchedAt: Date; lines: StoredRemitoLine[]
  }): Promise<void>
  listRemitos(query: RemitoListQuery): Promise<RemitoRow[]>
}

/** A BookletServiceError that also carries machine-readable context (for example the offending CUEs). */
export class RemitoDispatchError extends BookletServiceError {
  readonly details: Record<string, string[]>
  constructor(code: string, status: number, details: Record<string, string[]>) {
    super(code, status)
    this.details = details
  }
}

type Db = Awaited<ReturnType<typeof getDb>>

/** `overrides` apply to the transaction-bound repositories too (used by tests to stub external projections). */
export function createRemitoRepository(db: Db, overrides: Partial<RemitoRepository> = {}): RemitoRepository {
  const base = createApprovalRepository(db)
  const repository: RemitoRepository = {
    ...base,
    async transaction(operation) {
      return db.transaction((tx) => operation(createRemitoRepository(tx as unknown as Db, overrides)))
    },
    async getRecipientEligibility(cueAnexo, geSchema) {
      if (!geSchema) return { eligible: false, severity: null, evaluatedAt: new Date().toISOString(), name: null }
      const result = await getSchoolEligibilityWithName(cueAnexo, async (cue) => {
        const dashed = toDashedCue(cue)
        const { partes } = await listarPartesVigentes({ cueAnexo: dashed }, { db, client: crearEjecutorSql(db), geSchema })
        const matches = partes.filter((parte) => parte.cueAnexo === dashed)
        return matches.length === 1 ? { peorSeveridad: matches[0].peorSeveridad, nombre: matches[0].nombre } : null
      })
      return { eligible: result.eligible, severity: result.severity, evaluatedAt: result.evaluatedAt, name: result.nombre }
    },
    async recordDispatchMovement(input) {
      await db.insert(bookletStockMovement).values({
        id: randomUUID(), campaignId: input.campaignId, productId: input.productId, quantity: input.quantity,
        movement: 'dispatch', idempotencyKey: input.idempotencyKey, remitoId: input.remitoId, actorUserId: input.actorUserId,
      })
    },
    async insertRemito(remito) {
      await db.insert(bookletRemito).values({
        id: remito.id, campaignId: remito.campaignId, modo: remito.modo, cabeceraCueAnexo: remito.cabeceraCueAnexo, status: remito.status,
        dispatchedByUserId: remito.dispatchedByUserId, dispatchedAt: remito.dispatchedAt,
      })
      await db.insert(bookletRemitoLine).values(remito.lines.map((line) => ({
        id: line.id, remitoId: remito.id, recipientCueAnexo: line.recipientCueAnexo, recipientName: line.recipientName, status: line.status,
      })))
      await db.insert(bookletRemitoItem).values(remito.lines.flatMap((line) => line.items.map((item) => ({
        lineId: line.id, productId: item.productId, dispatchedQuantity: item.dispatchedQuantity,
      }))))
    },
    async listRemitos({ campaignId, after, limit }) {
      const predicates = []
      if (campaignId) predicates.push(eq(bookletRemito.campaignId, campaignId))
      if (after) {
        predicates.push(or(
          lt(bookletRemito.dispatchedAt, after.dispatchedAt),
          and(eq(bookletRemito.dispatchedAt, after.dispatchedAt), lt(bookletRemito.id, after.remitoId)),
        )!)
      }
      const remitos = await db.select().from(bookletRemito)
        .where(predicates.length > 0 ? and(...predicates) : undefined)
        .orderBy(desc(bookletRemito.dispatchedAt), desc(bookletRemito.id)).limit(limit)
      if (remitos.length === 0) return []
      const lines = await db.select().from(bookletRemitoLine)
        .where(inArray(bookletRemitoLine.remitoId, remitos.map((remito) => remito.id))).orderBy(bookletRemitoLine.recipientCueAnexo)
      const items = lines.length === 0 ? [] : await db.select({
        lineId: bookletRemitoItem.lineId, productId: bookletRemitoItem.productId, productName: bookletProduct.name,
        dispatchedQuantity: bookletRemitoItem.dispatchedQuantity,
        cabeceraReceivedQuantity: bookletRemitoItem.cabeceraReceivedQuantity, schoolReceivedQuantity: bookletRemitoItem.schoolReceivedQuantity,
      }).from(bookletRemitoItem).innerJoin(bookletProduct, eq(bookletProduct.id, bookletRemitoItem.productId))
        .where(inArray(bookletRemitoItem.lineId, lines.map((line) => line.id))).orderBy(bookletRemitoItem.productId)
      const signerIds = [...new Set([
        ...remitos.map((remito) => remito.cabeceraReceivedByUserId),
        ...lines.map((line) => line.schoolReceivedByUserId),
      ].filter((id): id is string => id !== null))]
      const signerRows = signerIds.length === 0 ? [] : await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, signerIds))
      const signerNames = new Map(signerRows.map((row) => [row.id, row.name]))
      const signer = (userId: string | null): RemitoSigner | null => userId === null ? null : { userId, name: signerNames.get(userId) ?? '' }
      return remitos.map((remito) => ({
        remitoId: remito.id, campaignId: remito.campaignId, modo: remito.modo as RemitoModo, cabeceraCueAnexo: remito.cabeceraCueAnexo,
        status: remito.status as RemitoRow['status'], dispatchedByUserId: remito.dispatchedByUserId,
        dispatchedAt: remito.dispatchedAt, cabeceraReceivedAt: remito.cabeceraReceivedAt,
        cabeceraReceivedBy: signer(remito.cabeceraReceivedByUserId),
        lines: lines.filter((line) => line.remitoId === remito.id).map((line) => ({
          lineId: line.id, recipientCueAnexo: line.recipientCueAnexo, recipientName: line.recipientName,
          status: line.status as StoredRemitoLine['status'],
          cabeceraShortfallReason: line.cabeceraShortfallReason, schoolShortfallReason: line.schoolShortfallReason,
          schoolReceivedBy: signer(line.schoolReceivedByUserId), schoolReceivedAt: line.schoolReceivedAt,
          items: items.filter((item) => item.lineId === line.id).map((item) => ({
            productId: item.productId, productName: item.productName, dispatchedQuantity: item.dispatchedQuantity,
            cabeceraReceivedQuantity: item.cabeceraReceivedQuantity, schoolReceivedQuantity: item.schoolReceivedQuantity,
          })),
        })),
      }))
    },
    ...overrides,
  }
  return repository
}

// Resolved on every access: inside cambioAuditado, getDb() returns the audited transaction.
const databaseRepository: RemitoRepository = new Proxy({} as RemitoRepository, {
  get: (_target, key) => Reflect.get(createRemitoRepository(getDb()), key),
})

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
// An absent modo and modo 'cabecera' are the same request; drop the default so
// both hash identically and records saved before modo existed still match.
const payloadHash = (input: DispatchRemitoInput) =>
  hash(input.modo === 'cabecera' ? { ...input, modo: undefined } : input)
const CUE = /^\d{9}$/

function validate(input: DispatchRemitoInput): void {
  const fail = (code: string) => { throw new BookletServiceError(code, 400) }
  if (typeof input.campaignId !== 'string' || input.campaignId.trim() === '') fail('invalid_campaign')
  const modo = input.modo ?? 'cabecera'
  if (modo !== 'cabecera' && modo !== 'directo') fail('invalid_modo')
  if (modo === 'cabecera' && (typeof input.cabeceraCueAnexo !== 'string' || !CUE.test(input.cabeceraCueAnexo))) fail('invalid_cabecera')
  if (modo === 'directo' && input.cabeceraCueAnexo !== undefined) fail('invalid_cabecera')
  if (typeof input.idempotencyKey !== 'string' || input.idempotencyKey.trim() === '') fail('invalid_idempotency_key')
  if (!Array.isArray(input.lines) || input.lines.length === 0) fail('invalid_remito')
  if (new Set(input.lines.map((line) => line.recipientCueAnexo)).size !== input.lines.length) fail('duplicate_recipient')
  for (const line of input.lines) {
    if (!CUE.test(line.recipientCueAnexo)) fail('invalid_recipient')
    if (!Array.isArray(line.items) || line.items.length === 0) fail('invalid_remito')
    for (const item of line.items) {
      if (typeof item.productId !== 'string' || item.productId.trim() === '' || !Number.isSafeInteger(item.quantity) || item.quantity <= 0) fail('invalid_quantity')
    }
    if (new Set(line.items.map((item) => item.productId)).size !== line.items.length) fail('invalid_quantity')
  }
}

function assertCampaign(campaign: CampaignPolicy | null): void {
  if (!campaign || campaign.status !== 'active') throw new BookletServiceError('campaign_inactive', 409)
  if (!campaign.distributionEnabled || campaign.overassignmentAllowed === null || campaign.overassignmentAllowed) throw new BookletServiceError('policy_unresolved', 409)
}

async function assertPlanning(actor: SessionUser | null, repository: RemitoRepository): Promise<SessionUser> {
  if (!actor || !await hasBookletCapability(actor, 'planning', repository)) throw new BookletServiceError('forbidden', 403)
  return actor
}

export async function dispatchRemito(actor: SessionUser, input: DispatchRemitoInput, repository: RemitoRepository = databaseRepository): Promise<DispatchedRemito> {
  validate(input)
  const modo: RemitoModo = input.modo ?? 'cabecera'
  // Null exactly when modo is 'directo' (validated above): no cabecera leg, so no cabecera authority check.
  const cabeceraCueAnexo = modo === 'cabecera' ? input.cabeceraCueAnexo! : null
  // Prepared outside the transaction, exactly like approveRequest: the projection bootstrap uses a separate connection.
  const geSchema = await repository.prepareCurrentEligibilityProjection?.()
  return repository.transaction(async (tx) => {
    await tx.lockEligibilitySources()
    await assertPlanning(actor, tx)
    await tx.lockIdempotency(actor.id, DISPATCH_OPERATION, input.idempotencyKey)
    const record = await tx.getIdempotency(actor.id, DISPATCH_OPERATION, input.idempotencyKey)
    if (record) {
      if (record.payloadHash !== payloadHash(input)) throw new BookletServiceError('idempotency_conflict', 409)
      describirAuditoria({ resultado: 'repetido' })
      return record.response as DispatchedRemito
    }
    assertCampaign(await tx.getCampaign(input.campaignId))
    if (cabeceraCueAnexo !== null && !await tx.approvalAuthorityReady(cabeceraCueAnexo)) throw new BookletServiceError('authority_unavailable', 503)

    const names = new Map<string, string | null>()
    const notCritical: string[] = []
    for (const line of input.lines) {
      const eligibility = await tx.getRecipientEligibility(line.recipientCueAnexo, geSchema)
      if (!eligibility.eligible || eligibility.severity !== 'Crítica') notCritical.push(line.recipientCueAnexo)
      names.set(line.recipientCueAnexo, eligibility.name)
    }
    if (notCritical.length > 0) throw new RemitoDispatchError('recipients_not_critical', 409, { recipientCueAnexos: notCritical.sort() })

    const totals = new Map<string, number>()
    for (const line of input.lines) for (const item of line.items) totals.set(item.productId, (totals.get(item.productId) ?? 0) + item.quantity)
    const products = [...totals.keys()].sort()
    for (const productId of products) if (!await tx.productExists(productId)) throw new BookletServiceError('product_not_found', 404)
    for (const productId of products) await tx.lockProduct(input.campaignId, productId)
    const short: string[] = []
    for (const productId of products) if (await tx.getStock(input.campaignId, productId) < totals.get(productId)!) short.push(productId)
    if (short.length > 0) throw new RemitoDispatchError('insufficient_stock', 409, { productIds: short })

    const remitoId = randomUUID()
    const dispatchedAt = new Date()
    // The remito row comes first: dispatch movements carry a foreign key to it.
    await tx.insertRemito({
      id: remitoId, campaignId: input.campaignId, modo, cabeceraCueAnexo, status: 'dispatched',
      dispatchedByUserId: actor.id, dispatchedAt,
      lines: input.lines.map((line) => ({
        id: randomUUID(), recipientCueAnexo: line.recipientCueAnexo, recipientName: names.get(line.recipientCueAnexo) ?? null, status: 'in_transit' as const,
        items: line.items.map((item) => ({ productId: item.productId, dispatchedQuantity: item.quantity })),
      })),
    })
    for (const productId of products) {
      const quantity = totals.get(productId)!
      if (!await tx.debitStock(input.campaignId, productId, quantity)) throw new RemitoDispatchError('insufficient_stock', 409, { productIds: [productId] })
      await tx.recordDispatchMovement({ campaignId: input.campaignId, productId, remitoId, quantity, actorUserId: actor.id, idempotencyKey: input.idempotencyKey })
    }
    const response: DispatchedRemito = {
      remitoId, campaignId: input.campaignId, modo, cabeceraCueAnexo, status: 'dispatched',
      dispatchedAt: dispatchedAt.toISOString(),
      lines: input.lines.map((line) => ({
        recipientCueAnexo: line.recipientCueAnexo, recipientName: names.get(line.recipientCueAnexo) ?? null, status: 'in_transit' as const,
        items: line.items.map(({ productId, quantity }) => ({ productId, quantity })),
      })),
    }
    await tx.saveIdempotency(actor.id, DISPATCH_OPERATION, input.idempotencyKey, { payloadHash: payloadHash(input), response })
    return response
  })
}

export type RemitoListInput = { campaignId?: string; cursor?: string; limit?: number }
export type RemitoPage = {
  remitos: Array<Omit<RemitoRow, 'dispatchedAt' | 'cabeceraReceivedAt' | 'lines'> & {
    dispatchedAt: string
    cabeceraReceivedAt: string | null
    lines: Array<Omit<RemitoRow['lines'][number], 'schoolReceivedAt'> & { schoolReceivedAt: string | null }>
  }>
  hasMore: boolean
  nextCursor: string | null
}

const encodeCursor = (row: RemitoRow) => Buffer.from(JSON.stringify({ t: row.dispatchedAt.toISOString(), id: row.remitoId })).toString('base64url')
function decodeCursor(cursor: string): RemitoCursor {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { t?: unknown; id?: unknown }
    const dispatchedAt = new Date(String(parsed.t))
    if (typeof parsed.id !== 'string' || parsed.id === '' || Number.isNaN(dispatchedAt.getTime())) throw new Error('bad cursor')
    return { dispatchedAt, remitoId: parsed.id }
  } catch {
    throw new BookletServiceError('invalid_cursor', 400)
  }
}

export async function listRemitosForPlanning(actor: SessionUser | null, input: RemitoListInput = {}, repository: RemitoRepository = databaseRepository): Promise<RemitoPage> {
  await assertPlanning(actor, repository)
  const pageSize = Number.isInteger(input.limit) && input.limit! > 0 ? Math.min(input.limit!, MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE
  const after = input.cursor ? decodeCursor(input.cursor) : null
  const rows = await repository.listRemitos({ campaignId: input.campaignId, after, limit: pageSize + 1 })
  const page = rows.slice(0, pageSize)
  return {
    remitos: page.map((row) => ({
      ...row,
      dispatchedAt: row.dispatchedAt.toISOString(),
      cabeceraReceivedAt: row.cabeceraReceivedAt?.toISOString() ?? null,
      lines: row.lines.map((line) => ({ ...line, schoolReceivedAt: line.schoolReceivedAt?.toISOString() ?? null })),
    })),
    hasMore: rows.length > pageSize,
    nextCursor: rows.length > pageSize ? encodeCursor(page.at(-1)!) : null,
  }
}
