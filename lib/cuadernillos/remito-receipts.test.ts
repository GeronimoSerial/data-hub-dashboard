import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SessionUser } from '@/lib/acl'
import { BookletServiceError } from './inventory'
import { listReceiptsForActor, receiveRemitoAtCabecera, receiveRemitoLineAtSchool, type ReceiptDb } from './remito-receipts'

let client: PGlite
let db: ReceiptDb
let counter = 0

const CAB = '180000100'
const SCHOOL_A = '180000200'

const actor = (id: string, role: SessionUser['role'], cueAnexo?: string, banned = false): SessionUser =>
  ({ id, role, banned, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [], cueAnexo: cueAnexo ?? null })
const cabeceraActor = actor('u-cab', 'consulta')
const adminActor = actor('u-admin', 'admin')
const schoolActor = actor('u-school', 'operador_establecimiento', '1800002-00')

beforeAll(async () => {
  client = new PGlite()
  await migrate(drizzle(client), { migrationsFolder: './drizzle' })
  db = drizzle(client) as unknown as ReceiptDb
  await client.exec(`
    INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at) VALUES
      ('u-plan', 'Planning', 'plan@example.test', true, now(), now()),
      ('u-cab', 'Cabecera Norte', 'cab@example.test', false, now(), now()),
      ('u-cab2', 'Other Cabecera', 'cab2@example.test', true, now(), now()),
      ('u-admin', 'Admin', 'admin@example.test', true, now(), now()),
      ('u-school', 'School A', 'school@example.test', true, now(), now()),
      ('u-school2', 'School B', 'school2@example.test', true, now(), now());
    INSERT INTO booklet_membership (id, user_id, capability, granted_by_user_id) VALUES
      ('m1', 'u-cab', 'cabecera', 'u-plan'), ('m2', 'u-cab2', 'cabecera', 'u-plan'), ('m3', 'u-admin', 'planning', 'u-plan');
    INSERT INTO booklet_campaign (id, name, status, distribution_enabled, overassignment_allowed)
      VALUES ('c1', 'Campaign', 'active', true, false);
    INSERT INTO booklet_product (id, name, level_code, grade_code) VALUES
      ('p1', 'Primero', 'primaria', '1'), ('p2', 'Segundo', 'primaria', '2');
    INSERT INTO booklet_school_assignment (cue_anexo, school_name, relationship, supervisor_name, supervisor_user_id,
      cabecera_cue, cabecera_user_id, provenance, confirmed_by_user_id, confirmed_at) VALUES
      ('${CAB}', 'Cabecera Norte', 'cabecera', 'Supervisor', 'u-plan', '${CAB}', 'u-cab', '[{"sourceId":"t","location":"1"}]', 'u-plan', now()),
      ('180000500', 'Cabecera Sur', 'cabecera', 'Supervisor', 'u-plan', '180000500', 'u-cab2', '[{"sourceId":"t","location":"2"}]', 'u-plan', now());
  `)
}, 120_000)

afterAll(async () => { await client.close() })

type SeedLine = { cue: string; items: Array<[string, number]> }
const DEFAULT_LINES: SeedLine[] = [
  { cue: SCHOOL_A, items: [['p1', 30], ['p2', 10]] },
  { cue: CAB, items: [['p1', 5]] },
]

async function seed(lines: SeedLine[] = DEFAULT_LINES) {
  const n = ++counter
  const remitoId = `rem-${n}`
  await client.exec(`INSERT INTO booklet_remito (id, campaign_id, cabecera_cue_anexo, status, dispatched_by_user_id, dispatched_at)
    VALUES ('${remitoId}', 'c1', '${CAB}', 'dispatched', 'u-plan', now() - make_interval(mins => ${100 - n}))`)
  const lineIds: string[] = []
  for (const [index, line] of lines.entries()) {
    const lineId = `line-${n}-${index}`
    lineIds.push(lineId)
    await client.exec(`INSERT INTO booklet_remito_line (id, remito_id, recipient_cue_anexo, status) VALUES ('${lineId}', '${remitoId}', '${line.cue}', 'in_transit')`)
    for (const [productId, quantity] of line.items) {
      await client.exec(`INSERT INTO booklet_remito_item (line_id, product_id, dispatched_quantity) VALUES ('${lineId}', '${productId}', ${quantity})`)
    }
  }
  return { remitoId, lineIds }
}

const fullInput = (lineIds: string[], lines: SeedLine[] = DEFAULT_LINES, overrides: Record<number, { quantities?: number[]; shortfallReason?: string }> = {}) => ({
  idempotencyKey: `key-${++counter}`,
  lines: lineIds.map((lineId, index) => ({
    lineId,
    items: lines[index].items.map(([productId, quantity], itemIndex) => ({ productId, receivedQuantity: overrides[index]?.quantities?.[itemIndex] ?? quantity })),
    ...(overrides[index]?.shortfallReason !== undefined ? { shortfallReason: overrides[index].shortfallReason } : {}),
  })),
})

async function rejection(promise: Promise<unknown>): Promise<BookletServiceError> {
  try { await promise } catch (error) { if (error instanceof BookletServiceError) return error; throw error }
  throw new Error('expected a BookletServiceError')
}
const q = async <T>(sql: string) => (await client.query<T>(sql)).rows

describe('receiveRemitoAtCabecera', () => {
  it('signs the whole remito at full quantity and closes the cabecera own line with the same signer', async () => {
    const { remitoId, lineIds } = await seed()
    const result = await receiveRemitoAtCabecera(cabeceraActor, remitoId, fullInput(lineIds), db)
    expect(result).toMatchObject({ remitoId, status: 'received', signerUserId: 'u-cab' })

    const [remito] = await q<{ status: string; by: string; at: string | null }>(`SELECT status, cabecera_received_by_user_id AS by, cabecera_received_at AS at FROM booklet_remito WHERE id = '${remitoId}'`)
    expect(remito).toMatchObject({ status: 'received', by: 'u-cab' })
    expect(remito.at).not.toBeNull()
    const items = await q<{ line_id: string; product_id: string; cab: number; school: number | null }>(`SELECT line_id, product_id, cabecera_received_quantity AS cab, school_received_quantity AS school FROM booklet_remito_item WHERE line_id IN ('${lineIds.join("','")}') ORDER BY line_id, product_id`)
    expect(items).toEqual([
      { line_id: lineIds[0], product_id: 'p1', cab: 30, school: null },
      { line_id: lineIds[0], product_id: 'p2', cab: 10, school: null },
      { line_id: lineIds[1], product_id: 'p1', cab: 5, school: 5 },
    ])
    const lines = await q<{ id: string; status: string; reason: string | null; by: string | null; at: string | null }>(`SELECT id, status, cabecera_shortfall_reason AS reason, school_received_by_user_id AS by, school_received_at AS at FROM booklet_remito_line WHERE remito_id = '${remitoId}' ORDER BY id`)
    expect(lines[0]).toMatchObject({ status: 'at_cabecera', reason: null, by: null, at: null })
    expect(lines[1]).toMatchObject({ status: 'received', reason: null, by: 'u-cab' })
    expect(lines[1].at).toEqual(remito.at)
  })

  it('stores the shortfall reason and keeps the line at the cabecera', async () => {
    const { remitoId, lineIds } = await seed()
    await receiveRemitoAtCabecera(cabeceraActor, remitoId, fullInput(lineIds, DEFAULT_LINES, { 0: { quantities: [28, 10], shortfallReason: '  Faltaron 2 cajas  ' } }), db)
    const [line] = await q<{ status: string; reason: string }>(`SELECT status, cabecera_shortfall_reason AS reason FROM booklet_remito_line WHERE id = '${lineIds[0]}'`)
    expect(line).toEqual({ status: 'at_cabecera', reason: 'Faltaron 2 cajas' })
    const [item] = await q<{ cab: number }>(`SELECT cabecera_received_quantity AS cab FROM booklet_remito_item WHERE line_id = '${lineIds[0]}' AND product_id = 'p1'`)
    expect(item.cab).toBe(28)
  })

  it('rejects a shortfall without a reason and writes nothing', async () => {
    const { remitoId, lineIds } = await seed()
    for (const shortfallReason of [undefined, '   ']) {
      const overrides = { 0: { quantities: [28, 10], ...(shortfallReason !== undefined ? { shortfallReason } : {}) } }
      const error = await rejection(receiveRemitoAtCabecera(cabeceraActor, remitoId, fullInput(lineIds, DEFAULT_LINES, overrides), db))
      expect(error).toMatchObject({ code: 'reason_required', status: 400 })
    }
    expect(await q(`SELECT 1 FROM booklet_remito WHERE id = '${remitoId}' AND status = 'dispatched' AND cabecera_received_by_user_id IS NULL`)).toHaveLength(1)
    expect(await q(`SELECT 1 FROM booklet_remito_item WHERE line_id IN ('${lineIds.join("','")}') AND cabecera_received_quantity IS NOT NULL`)).toHaveLength(0)
  })

  it('rejects a reason on a line without shortfall', async () => {
    const { remitoId, lineIds } = await seed()
    const error = await rejection(receiveRemitoAtCabecera(cabeceraActor, remitoId, fullInput(lineIds, DEFAULT_LINES, { 0: { shortfallReason: 'sin motivo real' } }), db))
    expect(error).toMatchObject({ code: 'reason_not_allowed', status: 400 })
    expect(await q(`SELECT 1 FROM booklet_remito WHERE id = '${remitoId}' AND status = 'dispatched'`)).toHaveLength(1)
  })

  it('rejects quantities above dispatched and negative or fractional quantities', async () => {
    const { remitoId, lineIds } = await seed()
    for (const quantity of [31, -1, 1.5]) {
      const error = await rejection(receiveRemitoAtCabecera(cabeceraActor, remitoId, fullInput(lineIds, DEFAULT_LINES, { 0: { quantities: [quantity, 10], shortfallReason: 'x' } }), db))
      expect(error).toMatchObject({ status: 400 })
    }
    expect(await q(`SELECT 1 FROM booklet_remito WHERE id = '${remitoId}' AND status = 'dispatched'`)).toHaveLength(1)
  })

  it('requires every line and item exactly once', async () => {
    const { remitoId, lineIds } = await seed()
    const missingLine = { idempotencyKey: 'k-miss-line', lines: fullInput(lineIds).lines.slice(0, 1) }
    expect(await rejection(receiveRemitoAtCabecera(cabeceraActor, remitoId, missingLine, db))).toMatchObject({ code: 'invalid_receipt', status: 400 })
    const full = fullInput(lineIds)
    const missingItem = { idempotencyKey: 'k-miss-item', lines: [{ ...full.lines[0], items: full.lines[0].items.slice(0, 1) }, full.lines[1]] }
    expect(await rejection(receiveRemitoAtCabecera(cabeceraActor, remitoId, missingItem, db))).toMatchObject({ code: 'invalid_receipt', status: 400 })
    const duplicated = { idempotencyKey: 'k-dup', lines: [full.lines[0], full.lines[0], full.lines[1]] }
    expect(await rejection(receiveRemitoAtCabecera(cabeceraActor, remitoId, duplicated, db))).toMatchObject({ code: 'invalid_receipt', status: 400 })
  })

  it('rejects an account that is not the assigned cabecera and writes nothing', async () => {
    const { remitoId, lineIds } = await seed()
    const other = await rejection(receiveRemitoAtCabecera(actor('u-cab2', 'consulta'), remitoId, fullInput(lineIds), db))
    expect(other).toMatchObject({ code: 'forbidden', status: 403 })
    const banned = await rejection(receiveRemitoAtCabecera(actor('u-cab', 'consulta', undefined, true), remitoId, fullInput(lineIds), db))
    expect(banned).toMatchObject({ status: 403 })
    expect(await q(`SELECT 1 FROM booklet_remito WHERE id = '${remitoId}' AND status = 'dispatched'`)).toHaveLength(1)
  })

  it('does not let a booklet admin sign', async () => {
    const { remitoId, lineIds } = await seed()
    const error = await rejection(receiveRemitoAtCabecera(adminActor, remitoId, fullInput(lineIds), db))
    expect(error).toMatchObject({ code: 'forbidden', status: 403 })
    expect(await q(`SELECT 1 FROM booklet_remito WHERE id = '${remitoId}' AND status = 'dispatched'`)).toHaveLength(1)
  })

  it('treats a signed receipt as immutable', async () => {
    const { remitoId, lineIds } = await seed()
    await receiveRemitoAtCabecera(cabeceraActor, remitoId, fullInput(lineIds), db)
    const error = await rejection(receiveRemitoAtCabecera(cabeceraActor, remitoId, fullInput(lineIds, DEFAULT_LINES, { 0: { quantities: [1, 1], shortfallReason: 'cambio' } }), db))
    expect(error).toMatchObject({ code: 'already_received', status: 409 })
    const [item] = await q<{ cab: number }>(`SELECT cabecera_received_quantity AS cab FROM booklet_remito_item WHERE line_id = '${lineIds[0]}' AND product_id = 'p1'`)
    expect(item.cab).toBe(30)
  })

  it('closes a line whose confirmed total is zero', async () => {
    const lines = [{ cue: SCHOOL_A, items: [['p1', 30], ['p2', 10]] as Array<[string, number]> }]
    const { remitoId, lineIds } = await seed(lines)
    await receiveRemitoAtCabecera(cabeceraActor, remitoId, fullInput(lineIds, lines, { 0: { quantities: [0, 0], shortfallReason: 'No llegó' } }), db)
    const [line] = await q<{ status: string; reason: string }>(`SELECT status, cabecera_shortfall_reason AS reason FROM booklet_remito_line WHERE id = '${lineIds[0]}'`)
    expect(line).toEqual({ status: 'closed_empty', reason: 'No llegó' })
  })

  it('replays an idempotent receipt without rewriting and rejects a changed payload under the same key', async () => {
    const { remitoId, lineIds } = await seed()
    const input = fullInput(lineIds)
    const first = await receiveRemitoAtCabecera(cabeceraActor, remitoId, input, db)
    const second = await receiveRemitoAtCabecera(cabeceraActor, remitoId, input, db)
    expect(second).toEqual(first)
    expect(await q(`SELECT 1 FROM booklet_idempotency WHERE operation = 'remito.receive.cabecera' AND idempotency_key = '${input.idempotencyKey}'`)).toHaveLength(1)
    const changed = fullInput(lineIds, DEFAULT_LINES, { 0: { quantities: [1, 1], shortfallReason: 'x' } })
    const error = await rejection(receiveRemitoAtCabecera(cabeceraActor, remitoId, { ...changed, idempotencyKey: input.idempotencyKey }, db))
    expect(error).toMatchObject({ code: 'idempotency_conflict', status: 409 })
  })

  it('answers 404 for an unknown remito', async () => {
    const error = await rejection(receiveRemitoAtCabecera(cabeceraActor, 'missing', { idempotencyKey: 'k', lines: [] }, db))
    expect(error).toMatchObject({ code: 'remito_not_found', status: 404 })
  })
})

describe('receiveRemitoLineAtSchool', () => {
  const twoLines: SeedLine[] = [{ cue: SCHOOL_A, items: [['p1', 30], ['p2', 10]] }]
  const schoolInput = (quantities: number[], shortfallReason?: string) => ({
    idempotencyKey: `sk-${++counter}`,
    items: [{ productId: 'p1', receivedQuantity: quantities[0] }, { productId: 'p2', receivedQuantity: quantities[1] }],
    ...(shortfallReason !== undefined ? { shortfallReason } : {}),
  })
  async function atCabecera(cabQuantities = [30, 10], reason?: string) {
    const { remitoId, lineIds } = await seed(twoLines)
    await receiveRemitoAtCabecera(cabeceraActor, remitoId, fullInput(lineIds, twoLines, { 0: { quantities: cabQuantities, ...(reason ? { shortfallReason: reason } : {}) } }), db)
    return { remitoId, lineId: lineIds[0] }
  }

  it('signs the line at the cabecera-confirmed quantity', async () => {
    const { lineId } = await atCabecera([28, 10], 'Faltaron 2')
    const result = await receiveRemitoLineAtSchool(schoolActor, lineId, schoolInput([28, 10]), db)
    expect(result).toMatchObject({ lineId, status: 'received', signerUserId: 'u-school' })
    const [line] = await q<{ status: string; by: string; at: string | null; reason: string | null }>(`SELECT status, school_received_by_user_id AS by, school_received_at AS at, school_shortfall_reason AS reason FROM booklet_remito_line WHERE id = '${lineId}'`)
    expect(line).toMatchObject({ status: 'received', by: 'u-school', reason: null })
    expect(line.at).not.toBeNull()
    const items = await q<{ product_id: string; school: number }>(`SELECT product_id, school_received_quantity AS school FROM booklet_remito_item WHERE line_id = '${lineId}' ORDER BY product_id`)
    expect(items).toEqual([{ product_id: 'p1', school: 28 }, { product_id: 'p2', school: 10 }])
  })

  it('records a school shortfall only with a reason', async () => {
    const { lineId } = await atCabecera()
    expect(await rejection(receiveRemitoLineAtSchool(schoolActor, lineId, schoolInput([20, 10]), db))).toMatchObject({ code: 'reason_required', status: 400 })
    expect(await q(`SELECT 1 FROM booklet_remito_line WHERE id = '${lineId}' AND status = 'at_cabecera'`)).toHaveLength(1)
    await receiveRemitoLineAtSchool(schoolActor, lineId, schoolInput([20, 10], 'Cajas dañadas'), db)
    const [line] = await q<{ reason: string }>(`SELECT school_shortfall_reason AS reason FROM booklet_remito_line WHERE id = '${lineId}'`)
    expect(line.reason).toBe('Cajas dañadas')
  })

  it('rejects quantities above what the cabecera confirmed', async () => {
    const { lineId } = await atCabecera([28, 10], 'Faltaron 2')
    const error = await rejection(receiveRemitoLineAtSchool(schoolActor, lineId, schoolInput([30, 10]), db))
    expect(error).toMatchObject({ status: 400 })
    expect(await q(`SELECT 1 FROM booklet_remito_line WHERE id = '${lineId}' AND status = 'at_cabecera'`)).toHaveLength(1)
  })

  it('rejects signing before the cabecera receipt', async () => {
    const { lineIds } = await seed(twoLines)
    const error = await rejection(receiveRemitoLineAtSchool(schoolActor, lineIds[0], schoolInput([30, 10]), db))
    expect(error).toMatchObject({ code: 'cabecera_receipt_pending', status: 409 })
  })

  it('rejects another school, a non-operador role and an admin', async () => {
    const { lineId } = await atCabecera()
    const otherCue = await rejection(receiveRemitoLineAtSchool(actor('u-school2', 'operador_establecimiento', '1800009-00'), lineId, schoolInput([30, 10]), db))
    expect(otherCue).toMatchObject({ code: 'forbidden', status: 403 })
    const noCue = await rejection(receiveRemitoLineAtSchool(actor('u-school2', 'operador_establecimiento'), lineId, schoolInput([30, 10]), db))
    expect(noCue).toMatchObject({ status: 403 })
    const wrongRole = await rejection(receiveRemitoLineAtSchool(actor('u-school', 'consulta', '1800002-00'), lineId, schoolInput([30, 10]), db))
    expect(wrongRole).toMatchObject({ status: 403 })
    const admin = await rejection(receiveRemitoLineAtSchool(adminActor, lineId, schoolInput([30, 10]), db))
    expect(admin).toMatchObject({ status: 403 })
    const banned = await rejection(receiveRemitoLineAtSchool(actor('u-school', 'operador_establecimiento', '1800002-00', true), lineId, schoolInput([30, 10]), db))
    expect(banned).toMatchObject({ status: 403 })
    expect(await q(`SELECT 1 FROM booklet_remito_line WHERE id = '${lineId}' AND status = 'at_cabecera'`)).toHaveLength(1)
  })

  it('keeps school receipts immutable and closed_empty lines unsignable', async () => {
    const { lineId } = await atCabecera()
    await receiveRemitoLineAtSchool(schoolActor, lineId, schoolInput([30, 10]), db)
    expect(await rejection(receiveRemitoLineAtSchool(schoolActor, lineId, schoolInput([1, 1], 'cambio'), db))).toMatchObject({ code: 'already_received', status: 409 })

    const { lineId: emptyLine } = await atCabecera([0, 0], 'No llegó')
    expect(await rejection(receiveRemitoLineAtSchool(schoolActor, emptyLine, schoolInput([0, 0]), db))).toMatchObject({ code: 'already_received', status: 409 })
  })

  it('replays an idempotent school receipt', async () => {
    const { lineId } = await atCabecera()
    const input = schoolInput([30, 10])
    const first = await receiveRemitoLineAtSchool(schoolActor, lineId, input, db)
    expect(await receiveRemitoLineAtSchool(schoolActor, lineId, input, db)).toEqual(first)
    expect(await q(`SELECT 1 FROM booklet_idempotency WHERE operation = 'remito.receive.school' AND idempotency_key = '${input.idempotencyKey}'`)).toHaveLength(1)
  })

  it('requires every item exactly once', async () => {
    const { lineId } = await atCabecera()
    const error = await rejection(receiveRemitoLineAtSchool(schoolActor, lineId, { idempotencyKey: 'sk-partial', items: [{ productId: 'p1', receivedQuantity: 30 }] }, db))
    expect(error).toMatchObject({ code: 'invalid_receipt', status: 400 })
  })
})

describe('full custody chain on a real database', () => {
  it('goes dispatched -> cabecera receipt -> school receipt and lists each step for the right account', async () => {
    const lines: SeedLine[] = [{ cue: SCHOOL_A, items: [['p1', 12]] }, { cue: CAB, items: [['p2', 4]] }]
    const { remitoId, lineIds } = await seed(lines)

    const pendingForSchool = await listReceiptsForActor(schoolActor, db)
    expect(pendingForSchool.kind).toBe('school')
    if (pendingForSchool.kind !== 'school') throw new Error('unreachable')
    expect(pendingForSchool.lines.some((line) => line.lineId === lineIds[0])).toBe(true)
    expect(pendingForSchool.lines.find((line) => line.lineId === lineIds[0])!.status).toBe('in_transit')

    const cabecera = await listReceiptsForActor(cabeceraActor, db)
    expect(cabecera.kind).toBe('cabecera')
    if (cabecera.kind !== 'cabecera') throw new Error('unreachable')
    const pending = cabecera.remitos.find((remito) => remito.remitoId === remitoId)!
    expect(pending.status).toBe('dispatched')
    expect(pending.lines.find((line) => line.lineId === lineIds[0])!.items).toEqual([
      { productId: 'p1', productName: 'Primero', dispatchedQuantity: 12, cabeceraReceivedQuantity: null },
    ])

    await receiveRemitoAtCabecera(cabeceraActor, remitoId, fullInput(lineIds, lines, { 0: { quantities: [10], shortfallReason: 'Faltaron 2' } }), db)

    const forSchool = await listReceiptsForActor(schoolActor, db)
    if (forSchool.kind !== 'school') throw new Error('unreachable')
    const toConfirm = forSchool.lines.find((line) => line.lineId === lineIds[0])!
    expect(toConfirm).toMatchObject({ status: 'at_cabecera', cabeceraReceivedBy: { userId: 'u-cab', name: 'Cabecera Norte' } })
    expect(toConfirm.items).toEqual([{ productId: 'p1', productName: 'Primero', expectedQuantity: 10, schoolReceivedQuantity: null }])
    expect(forSchool.lines[0].lineId).toBe(lineIds[0])

    await receiveRemitoLineAtSchool(schoolActor, lineIds[0], { idempotencyKey: 'chain-school', items: [{ productId: 'p1', receivedQuantity: 10 }] }, db)
    const done = await listReceiptsForActor(schoolActor, db)
    if (done.kind !== 'school') throw new Error('unreachable')
    expect(done.lines.find((line) => line.lineId === lineIds[0])).toMatchObject({ status: 'received', schoolReceivedBy: { userId: 'u-school', name: 'School A' } })

    const history = await listReceiptsForActor(cabeceraActor, db)
    if (history.kind !== 'cabecera') throw new Error('unreachable')
    expect(history.remitos.find((remito) => remito.remitoId === remitoId)).toMatchObject({ status: 'received', cabeceraReceivedBy: { userId: 'u-cab' } })
  })

  it('lists pending remitos before history and refuses other accounts', async () => {
    const history = await seed()
    await receiveRemitoAtCabecera(cabeceraActor, history.remitoId, fullInput(history.lineIds), db)
    const pending = await seed()
    const result = await listReceiptsForActor(cabeceraActor, db)
    if (result.kind !== 'cabecera') throw new Error('unreachable')
    const ids = result.remitos.map((remito) => remito.remitoId)
    expect(ids.indexOf(pending.remitoId)).toBeLessThan(ids.indexOf(history.remitoId))
    expect(await rejection(listReceiptsForActor(adminActor, db))).toMatchObject({ status: 403 })
    expect(await rejection(listReceiptsForActor(actor('u-school', 'consulta'), db))).toMatchObject({ status: 403 })
  })
})
