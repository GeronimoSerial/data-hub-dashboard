import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { approveRequest, approvalRepository, createApprovalRepository, type ApprovalRepository } from './approvals'
import { confirmStagedAssignmentSource, stageAssignmentSourceManifest } from './assignment-source'
import { crearEjecutorSql, ensureGeSchema, type GeSchemaReady } from '@/lib/infraestructura/ge-db'
import type { SessionUser } from '@/lib/acl'
import type { ApprovalInput } from './types'
import type { AssignmentSourceRow } from './types'

const url = process.env.CUADERNILLOS_PG_TEST_DATABASE_URL
const explicitlyEnabled = process.env.CUADERNILLOS_PG_TESTS === '1'

if (Boolean(url) !== explicitlyEnabled) {
  throw new Error('Set both CUADERNILLOS_PG_TESTS=1 and CUADERNILLOS_PG_TEST_DATABASE_URL for isolated PostgreSQL proofs')
}

const postgresDescribe = explicitlyEnabled ? describe : describe.skip
let pool: Pool
let periodId: string
let cueAnexo: string
let partId: string
let affectationId: string
let geSchema: GeSchemaReady

function localSocketHost(connectionUrl: string): string {
  const parsed = new URL(connectionUrl)
  const host = parsed.searchParams.get('host')
  const database = decodeURIComponent(parsed.pathname.slice(1))
  if (database !== 'cuadernillos_pg_test' || !host?.startsWith('/')) {
    throw new Error('PostgreSQL proof requires database cuadernillos_pg_test on a Unix-domain socket')
  }
  return host
}

async function waitUntilAdvisoryBlocked(): Promise<void> {
  for (let attempt = 0; attempt < 250; attempt++) {
    const result = await pool.query(
      `SELECT 1 FROM pg_stat_activity
       WHERE pid <> pg_backend_pid() AND wait_event_type = 'Lock' AND wait_event = 'advisory'
       LIMIT 1`,
    )
    if (result.rows.length > 0) return
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 10))
  }
  throw new Error('Timed out waiting for the source-write advisory lock')
}

async function waitUntilMembershipBlocked(): Promise<void> {
  for (let attempt = 0; attempt < 250; attempt++) {
    const result = await pool.query(
      `SELECT 1 FROM pg_stat_activity
       WHERE pid <> pg_backend_pid() AND wait_event_type = 'Lock'
         AND query ILIKE '%booklet_membership%' LIMIT 1`,
    )
    if (result.rows.length > 0) return
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 10))
  }
  throw new Error('Timed out waiting for the membership row lock')
}

async function projectEligibility(client: PoolClient) {
  const repository = createApprovalRepository(drizzle(client))
  return repository.transaction(async (tx) => {
    await tx.lockEligibilitySources()
    return tx.getCurrentEligibility(cueAnexo, geSchema)
  })
}

type ApprovalFixture = {
  campaignId: string
  productId: string
  supervisorId: string
  cabeceraUserId: string
  secondCabeceraUserId: string
  plannerId: string
  headCue: string
  secondHeadCue: string
  sourceRevisionId: string
  requestIds: string[]
  idempotencyKeys: string[]
  actor: SessionUser
  inputs: ApprovalInput[]
}

function makeIsolatedProjectionRepository(db: Parameters<typeof createApprovalRepository>[0]): ApprovalRepository {
  const productionAdapter = createApprovalRepository(db)
  return {
    ...productionAdapter,
    // The source revision and account trust are read through the production
    // adapter; only the GE schema capability is scoped to the isolated pool.
    async prepareCurrentEligibilityProjection() { return geSchema },
  }
}

function newCue(): string {
  return String(100_000_000 + Math.floor(Math.random() * 900_000_000))
}

async function createApprovalFixture(options: {
  requestCount: number
  requested: number
  stock: number
  quota: number
}): Promise<ApprovalFixture> {
  const suffix = randomUUID()
  const campaignId = `pg-approve-${suffix}`
  const productId = `pg-product-${suffix}`
  const supervisorId = `pg-supervisor-${suffix}`
  const cabeceraUserId = `pg-cabecera-${suffix}`
  const secondCabeceraUserId = `pg-cabecera-two-${suffix}`
  const plannerId = `pg-planner-${suffix}`
  const headCue = newCue()
  const secondHeadCue = newCue()
  const recipientCue = cueAnexo
  const requestIds = Array.from({ length: options.requestCount }, () => `pg-request-${randomUUID()}`)
  const idempotencyKeys = requestIds.map(() => `pg-idem-${randomUUID()}`)

  await pool.query(
    `INSERT INTO "user" (id, name, email, email_verified, banned) VALUES
     ($1, 'PG fixture supervisor', $2, true, false),
     ($3, 'PG fixture cabecera', $4, true, false),
     ($5, 'PG fixture planner', $6, true, false),
     ($7, 'PG fixture second cabecera', $8, true, false)`,
    [supervisorId, `${supervisorId}@fixture.invalid`, cabeceraUserId, `${cabeceraUserId}@fixture.invalid`, plannerId, `${plannerId}@fixture.invalid`, secondCabeceraUserId, `${secondCabeceraUserId}@fixture.invalid`],
  )
  await pool.query(
    `INSERT INTO booklet_membership (id, user_id, capability, granted_by_user_id) VALUES
     ($1, $2, 'supervisor', $2), ($3, $4, 'cabecera', $4), ($5, $6, 'planning', $6), ($7, $8, 'cabecera', $8)`,
    [`pg-membership-${suffix}-sup`, supervisorId, `pg-membership-${suffix}-head`, cabeceraUserId, `pg-membership-${suffix}-plan`, plannerId, `pg-membership-${suffix}-head2`, secondCabeceraUserId],
  )
  const sourceId = `fixture-${suffix}`
  const sourceRows: AssignmentSourceRow[] = [
    { cue: headCue, schoolName: 'PG fixture head', relationship: 'cabecera', supervisorName: 'PG fixture supervisor', cabeceraCue: null, provenance: { sourceId, location: 'fixture/head' } },
    { cue: recipientCue, schoolName: 'PG fixture recipient', relationship: 'dependiente', supervisorName: 'PG fixture supervisor', cabeceraCue: headCue, provenance: { sourceId, location: 'fixture/recipient' } },
    { cue: secondHeadCue, schoolName: 'PG fixture second head', relationship: 'cabecera', supervisorName: 'PG fixture supervisor', cabeceraCue: null, provenance: { sourceId, location: 'fixture/second-head' } },
  ]
  const planningActor: SessionUser = { id: plannerId, role: 'admin', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [] }
  const staged = await stageAssignmentSourceManifest(planningActor, sourceId, sourceRows, drizzle(pool))
  await confirmStagedAssignmentSource(planningActor, staged.previewHash, staged.preview.accepted.map((assignment) => ({
    cueAnexo: assignment.cueAnexo,
    sourceRowHash: staged.sourceRowHashes[assignment.cueAnexo],
    supervisorUserId: supervisorId,
    cabeceraUserId: assignment.cueAnexo === secondHeadCue ? secondCabeceraUserId : cabeceraUserId,
  })), drizzle(pool))
  await pool.query(
    `INSERT INTO booklet_campaign (id, name, status, distribution_enabled, overassignment_allowed)
     VALUES ($1, 'PG approval fixture', 'active', true, false)`,
    [campaignId],
  )
  await pool.query(
    `INSERT INTO booklet_product (id, name, level_code, grade_code) VALUES ($1, 'PG product', 'L1', 'G1')`,
    [productId],
  )
  await pool.query('INSERT INTO booklet_stock (campaign_id, product_id, quantity) VALUES ($1, $2, $3)', [campaignId, productId, options.stock])
  await pool.query(
    `INSERT INTO booklet_quota (campaign_id, cabecera_cue_anexo, product_id, quantity, updated_by_user_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [campaignId, headCue, productId, options.quota, supervisorId],
  )
  for (let index = 0; index < requestIds.length; index++) {
    await pool.query(
      `INSERT INTO booklet_request
         (id, campaign_id, recipient_cue_anexo, cabecera_cue_anexo, root_request_id,
          status, created_by_user_id, submitted_at)
       VALUES ($1, $2, $3, $4, $1, 'pending', $5, now())`,
      [requestIds[index], campaignId, recipientCue, headCue, cabeceraUserId],
    )
    await pool.query(
      `INSERT INTO booklet_request_line (request_id, product_id, quantity)
       VALUES ($1, $2, $3)`,
      [requestIds[index], productId, options.requested],
    )
  }
  return {
    campaignId,
    productId,
    supervisorId,
    cabeceraUserId,
    secondCabeceraUserId,
    plannerId,
    headCue,
    secondHeadCue,
    sourceRevisionId: staged.revisionId,
    requestIds,
    idempotencyKeys,
    actor: {
      id: supervisorId,
      role: 'admin',
      banned: false,
      nivelJurIds: [],
      accesoRecursos: 'todos',
      recursoIds: [],
    },
    inputs: requestIds.map((requestId, index) => ({
      requestId,
      idempotencyKey: idempotencyKeys[index]!,
      lines: [{ productId, quantity: options.requested }],
    })),
  }
}

async function deleteApprovalFixture(fixture: ApprovalFixture): Promise<void> {
  await pool.query(
    `DELETE FROM booklet_idempotency WHERE actor_user_id = $1 AND operation = 'request.approve'`,
    [fixture.supervisorId],
  )
  await pool.query('DELETE FROM booklet_stock_movement WHERE request_id = ANY($1::text[])', [fixture.requestIds])
  await pool.query('UPDATE booklet_request SET root_request_id = NULL WHERE id = ANY($1::text[])', [fixture.requestIds])
  await pool.query('DELETE FROM booklet_request WHERE id = ANY($1::text[])', [fixture.requestIds])
  await pool.query('DELETE FROM booklet_quota WHERE campaign_id = $1', [fixture.campaignId])
  await pool.query('DELETE FROM booklet_stock WHERE campaign_id = $1', [fixture.campaignId])
  await pool.query('DELETE FROM booklet_school_assignment WHERE cue_anexo = ANY($1::text[])', [[fixture.headCue, fixture.secondHeadCue, cueAnexo]])
  await pool.query('DELETE FROM booklet_assignment_source_revision WHERE id = $1', [fixture.sourceRevisionId])
  await pool.query('DELETE FROM booklet_membership WHERE user_id = ANY($1::text[])', [[fixture.supervisorId, fixture.cabeceraUserId, fixture.secondCabeceraUserId, fixture.plannerId]])
  await pool.query('DELETE FROM booklet_campaign WHERE id = $1', [fixture.campaignId])
  await pool.query('DELETE FROM booklet_product WHERE id = $1', [fixture.productId])
  await pool.query('DELETE FROM "user" WHERE id = ANY($1::text[])', [[fixture.supervisorId, fixture.cabeceraUserId, fixture.secondCabeceraUserId, fixture.plannerId]])
}

async function setSeverity(client: PoolClient, severity: string): Promise<void> {
  await client.query('UPDATE infra_afectacion SET severidad = $1 WHERE id = $2', [severity, affectationId])
}

postgresDescribe('isolated PostgreSQL eligibility and inventory proofs', () => {
  beforeAll(async () => {
    if (!url) throw new Error('Missing explicit isolated PostgreSQL URL')
    localSocketHost(url)
    pool = new Pool({ connectionString: url, max: 8 })
    const identity = await pool.query(`
      SELECT current_database() AS database, inet_server_addr()::text AS address,
             current_setting('server_version_num')::integer AS version
    `)
    if (identity.rows[0]?.database !== 'cuadernillos_pg_test'
      || identity.rows[0]?.address !== null
      || identity.rows[0]?.version < 150000) {
      throw new Error('PostgreSQL proof target must be the explicitly named local socket-only disposable database')
    }

    await migrate(drizzle(pool), { migrationsFolder: resolve(process.cwd(), 'drizzle') })
    geSchema = await ensureGeSchema(crearEjecutorSql(pool))

    await pool.query(`
      DELETE FROM ge.ge_localizacion
      WHERE cue_anexo IN (
        SELECT p.cue_anexo FROM infra_parte p
        LEFT JOIN infra_periodo ip ON ip.id = p.periodo_id
        WHERE p.id LIKE 'cuadernillos-pg-%' OR ip.nombre = 'Cuadernillos PG fixture'
      )
    `)
    await pool.query(`DELETE FROM infra_afectacion WHERE parte_id IN (
      SELECT p.id FROM infra_parte p LEFT JOIN infra_periodo ip ON ip.id = p.periodo_id
      WHERE p.id LIKE 'cuadernillos-pg-%' OR ip.nombre = 'Cuadernillos PG fixture'
    )`)
    await pool.query(`DELETE FROM infra_parte WHERE id IN (
      SELECT p.id FROM infra_parte p LEFT JOIN infra_periodo ip ON ip.id = p.periodo_id
      WHERE p.id LIKE 'cuadernillos-pg-%' OR ip.nombre = 'Cuadernillos PG fixture'
    )`)
    await pool.query(`DELETE FROM infra_periodo WHERE id LIKE 'cuadernillos-pg-%' OR nombre = 'Cuadernillos PG fixture'`)

    periodId = `cuadernillos-pg-${randomUUID()}`
    cueAnexo = `${Math.floor(100000000 + Math.random() * 900000000)}`
    partId = `cuadernillos-pg-${randomUUID()}`
    affectationId = randomUUID()
    const now = new Date().toISOString()
    await pool.query(
      `INSERT INTO infra_periodo (id, nombre, inicio_en, fin_en, estado, creada_en)
       VALUES ($1, 'Cuadernillos PG fixture', $2, NULL, 'vigente', $2)`,
      [periodId, now],
    )
    await pool.query(
      `INSERT INTO ge.ge_localizacion (cue_anexo, nombre, departamento, localidad)
       VALUES ($1, 'Fixture school', 'Fixture', 'Fixture')`,
      [cueAnexo],
    )
    await pool.query(
      `INSERT INTO infra_parte (id, periodo_id, cue_anexo, estado_establecimiento,
        estado_establecimiento_rige_desde, corte_id, creada_en, actualizada_en)
       VALUES ($1, $2, $3, 'habitual', $4, 0, $4, $4)`,
      [partId, periodId, cueAnexo, now],
    )
    await pool.query(
      `INSERT INTO infra_afectacion (id, parte_id, motivo, categoria, severidad,
        rige_desde, creada_en, retirada_en)
       VALUES ($1, $2, 'fixture', 'establecimiento', 'Crítica', $3, $3, NULL)`,
      [affectationId, partId, now],
    )
  }, 60_000)

  afterAll(async () => {
    if (!pool) return
    if (affectationId) await pool.query('DELETE FROM infra_afectacion WHERE id = $1', [affectationId])
    if (partId) await pool.query('DELETE FROM infra_parte WHERE id = $1', [partId])
    if (periodId) await pool.query('DELETE FROM infra_periodo WHERE id = $1', [periodId])
    if (cueAnexo) await pool.query('DELETE FROM ge.ge_localizacion WHERE cue_anexo = $1', [cueAnexo])
    await pool.end()
  })

  it('installs the source-write guard on every live eligibility input', async () => {
    const triggers = await pool.query(`
      SELECT n.nspname || '.' || c.relname AS relation_name
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE t.tgname = 'booklet_eligibility_source_guard'
        AND NOT t.tgisinternal
      ORDER BY relation_name
    `)
    expect(triggers.rows.map((row) => row.relation_name)).toEqual([
      'ge.ge_alumno_seccion', 'ge.ge_corte', 'ge.ge_localizacion', 'ge.ge_seccion',
      'public.infra_afectacion', 'public.infra_afectacion_alumno', 'public.infra_afectacion_seccion',
      'public.infra_parte', 'public.infra_periodo', 'public.matricula_carrera', 'public.matricula_corte',
    ])
  })

  it('keeps the default action adapter fail-closed pending trusted assignment reconciliation', async () => {
    await expect(approvalRepository.approvalAuthorityReady('180123456', '180123456')).resolves.toBe(false)
  })

  it('rejects mutation of a confirmed server-staged source revision', async () => {
    const fixture = await createApprovalFixture({ requestCount: 1, requested: 25, stock: 100, quota: 100 })
    try {
      await expect(pool.query('UPDATE booklet_assignment_source_revision SET source_rows = \'[]\'::jsonb WHERE id = $1', [fixture.sourceRevisionId]))
        .rejects.toThrow(/immutable/i)
    } finally {
      await deleteApprovalFixture(fixture)
    }
  })

  it('prevents changing a confirmed assignment source hash', async () => {
    const fixture = await createApprovalFixture({ requestCount: 1, requested: 25, stock: 100, quota: 100 })
    try {
      await expect(pool.query('UPDATE booklet_school_assignment SET source_row_hash = $1 WHERE cue_anexo = $2', ['0'.repeat(64), cueAnexo]))
        .rejects.toThrow(/immutable/i)
      const repository = createApprovalRepository(drizzle(pool))
      await expect(repository.approvalAuthorityReady(cueAnexo, fixture.headCue)).resolves.toBe(true)
    } finally {
      await deleteApprovalFixture(fixture)
    }
  })

  it('denies legacy assignments that have no staged source binding', async () => {
    const fixture = await createApprovalFixture({ requestCount: 1, requested: 25, stock: 100, quota: 100 })
    const legacyCue = newCue()
    try {
      await pool.query(
        `INSERT INTO booklet_school_assignment
           (cue_anexo, school_name, relationship, supervisor_name, supervisor_user_id, cabecera_cue, cabecera_user_id,
            provenance, confirmed_by_user_id, confirmed_at)
         VALUES ($1, 'Legacy row', 'cabecera', 'PG fixture supervisor', $2, $1, $3, $4::jsonb, $5, now())`,
        [legacyCue, fixture.supervisorId, fixture.cabeceraUserId, JSON.stringify([{ sourceId: 'legacy', location: 'legacy' }]), fixture.plannerId],
      )
      await expect(createApprovalRepository(drizzle(pool)).approvalAuthorityReady(legacyCue, legacyCue)).resolves.toBe(false)
    } finally {
      await pool.query('DELETE FROM booklet_school_assignment WHERE cue_anexo = $1', [legacyCue])
      await deleteApprovalFixture(fixture)
    }
  })

  it('prevents retargeting a confirmed dependent to another same-revision head and account', async () => {
    const fixture = await createApprovalFixture({ requestCount: 1, requested: 25, stock: 100, quota: 100 })
    try {
      await expect(pool.query(
        'UPDATE booklet_school_assignment SET cabecera_cue = $1, cabecera_user_id = $2 WHERE cue_anexo = $3',
        [fixture.secondHeadCue, fixture.secondCabeceraUserId, cueAnexo],
      )).rejects.toThrow(/immutable/i)
      const authority = await createApprovalRepository(drizzle(pool)).approvalAuthorityReady(cueAnexo, fixture.headCue)
      expect(authority).toBe(true)
    } finally {
      await deleteApprovalFixture(fixture)
    }
  })

  it('requires separate capability checks when one account is proposed for both assignment roles', async () => {
    const suffix = randomUUID()
    const plannerId = `pg-planner-${suffix}`
    const sharedId = `pg-shared-${suffix}`
    const cue = newCue()
    const sourceId = `fixture-${suffix}`
    await pool.query(
      `INSERT INTO "user" (id, name, email, email_verified, banned) VALUES
       ($1, 'PG planner', $2, true, false), ($3, 'PG shared', $4, true, false)`,
      [plannerId, `${plannerId}@fixture.invalid`, sharedId, `${sharedId}@fixture.invalid`],
    )
    await pool.query(
      `INSERT INTO booklet_membership (id, user_id, capability, granted_by_user_id) VALUES
       ($1, $2, 'planning', $2), ($3, $4, 'cabecera', $4)`,
      [`pg-membership-${suffix}-plan`, plannerId, `pg-membership-${suffix}-head`, sharedId],
    )
    const actor: SessionUser = { id: plannerId, role: 'admin', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [] }
    const staged = await stageAssignmentSourceManifest(actor, sourceId, [{
      cue, schoolName: 'PG fixture head', relationship: 'cabecera', supervisorName: 'PG fixture supervisor', cabeceraCue: null,
      provenance: { sourceId, location: 'fixture/head' },
    }], drizzle(pool))
    try {
      await expect(confirmStagedAssignmentSource(actor, staged.previewHash, [{
        cueAnexo: cue, sourceRowHash: staged.sourceRowHashes[cue], supervisorUserId: sharedId, cabeceraUserId: sharedId,
      }], drizzle(pool))).rejects.toMatchObject({ code: 'responsible_account_unavailable' })
      const state = await pool.query('SELECT count(*)::int AS count FROM booklet_school_assignment WHERE cue_anexo = $1', [cue])
      expect(state.rows[0]?.count).toBe(0)
    } finally {
      await pool.query('DELETE FROM booklet_school_assignment WHERE cue_anexo = $1', [cue])
      await pool.query('DELETE FROM booklet_assignment_source_revision WHERE id = $1', [staged.revisionId])
      await pool.query('DELETE FROM booklet_membership WHERE user_id = ANY($1::text[])', [[plannerId, sharedId]])
      await pool.query('DELETE FROM "user" WHERE id = ANY($1::text[])', [[plannerId, sharedId]])
    }
  })

  it('serializes planner membership revocation against assignment confirmation', async () => {
    const fixture = await createApprovalFixture({ requestCount: 1, requested: 25, stock: 100, quota: 100 })
    const cue = newCue()
    const sourceId = `fixture-race-${randomUUID()}`
    const staged = await stageAssignmentSourceManifest({ ...fixture.actor, id: fixture.plannerId }, sourceId, [{
      cue, schoolName: 'PG race fixture', relationship: 'cabecera', supervisorName: 'PG fixture supervisor', cabeceraCue: null,
      provenance: { sourceId, location: 'fixture/race' },
    }], drizzle(pool))
    const revoke = await pool.connect()
    let confirmation: Promise<unknown> | null = null
    try {
      await revoke.query('BEGIN')
      await revoke.query("UPDATE booklet_membership SET revoked_at = now() WHERE user_id = $1 AND capability = 'planning'", [fixture.plannerId])
      confirmation = confirmStagedAssignmentSource({ ...fixture.actor, id: fixture.plannerId }, staged.previewHash, [{
        cueAnexo: cue, sourceRowHash: staged.sourceRowHashes[cue], supervisorUserId: fixture.supervisorId, cabeceraUserId: fixture.cabeceraUserId,
      }], drizzle(pool))
      await waitUntilMembershipBlocked()
      await revoke.query('COMMIT')
      await expect(confirmation).rejects.toMatchObject({ code: 'forbidden' })
      const state = await pool.query('SELECT count(*)::int AS count FROM booklet_school_assignment WHERE cue_anexo = $1', [cue])
      expect(state.rows[0]?.count).toBe(0)
    } finally {
      await revoke.query('ROLLBACK').catch(() => undefined)
      revoke.release()
      if (confirmation) await confirmation.catch(() => undefined)
      await pool.query('DELETE FROM booklet_school_assignment WHERE cue_anexo = $1', [cue])
      await pool.query('DELETE FROM booklet_assignment_source_revision WHERE id = $1', [staged.revisionId])
      await deleteApprovalFixture(fixture)
    }
  })

  it('rejects a source-first loss of critical severity without changing request, balances, signature, or movement', async () => {
    const fixture = await createApprovalFixture({ requestCount: 1, requested: 25, stock: 100, quota: 100 })
    try {
      await pool.query('UPDATE infra_afectacion SET severidad = $1 WHERE id = $2', ['Alta', affectationId])
      await expect(approveRequest(
        fixture.actor,
        fixture.inputs[0]!,
        makeIsolatedProjectionRepository(drizzle(pool)),
      )).rejects.toMatchObject({ code: 'authority_changed' })

      const state = await pool.query(`
        SELECT r.status, r.approved_by_user_id, r.approved_at,
               r.rejected_by_user_id, r.rejected_at, line.approved_quantity, s.quantity AS stock,
               q.quantity AS quota,
               (SELECT count(*)::int FROM booklet_stock_movement m WHERE m.request_id = r.id) AS movements,
               (SELECT count(*)::int FROM booklet_idempotency i
                WHERE i.actor_user_id = $2 AND i.operation = 'request.approve') AS idempotency_records
        FROM booklet_request r
        JOIN booklet_request_line line ON line.request_id = r.id AND line.product_id = $3
        JOIN booklet_stock s ON s.campaign_id = r.campaign_id AND s.product_id = $3
        JOIN booklet_quota q ON q.campaign_id = r.campaign_id AND q.product_id = $3
             AND q.cabecera_cue_anexo = r.cabecera_cue_anexo
        WHERE r.id = $1
      `, [fixture.requestIds[0], fixture.supervisorId, fixture.productId])
      expect(state.rows[0]).toEqual({
        status: 'pending', approved_by_user_id: null, approved_at: null,
        rejected_by_user_id: null, rejected_at: null, approved_quantity: 0,
        stock: 100, quota: 100, movements: 0, idempotency_records: 0,
      })
    } finally {
      await pool.query('UPDATE infra_afectacion SET severidad = $1 WHERE id = $2', ['Crítica', affectationId])
      await deleteApprovalFixture(fixture)
    }
  })

  it('replays concurrent approval attempts with one signature and one complete persisted result', async () => {
    const fixture = await createApprovalFixture({ requestCount: 1, requested: 60, stock: 100, quota: 100 })
    try {
      await pool.query('UPDATE infra_afectacion SET severidad = $1 WHERE id = $2', ['Crítica', affectationId])
      const repository = makeIsolatedProjectionRepository(drizzle(pool))
      const outcomes = await Promise.allSettled([
        approveRequest(fixture.actor, fixture.inputs[0]!, repository),
        approveRequest(fixture.actor, fixture.inputs[0]!, repository),
      ])
      expect(outcomes[0]).toMatchObject({ status: 'fulfilled', value: { status: 'approved' } })
      expect(outcomes[1]).toMatchObject({ status: 'fulfilled', value: { status: 'approved' } })
      const firstResult = outcomes[0].status === 'fulfilled' ? outcomes[0].value : null
      const replayResult = outcomes[1].status === 'fulfilled' ? outcomes[1].value : null
      expect(firstResult).not.toBeNull()
      expect(replayResult).toEqual(firstResult)
      if (!firstResult) throw new Error('Expected the first approval to succeed')

      const persisted = await pool.query(`
        SELECT s.quantity AS stock, q.quantity AS quota,
               (SELECT count(*)::int FROM booklet_request r
                WHERE r.campaign_id = $1 AND r.status = 'approved'
                  AND r.approved_by_user_id IS NOT NULL AND r.approved_at IS NOT NULL) AS signed_requests,
               (SELECT count(*)::int FROM booklet_stock_movement m WHERE m.campaign_id = $1) AS movements,
               (SELECT count(*)::int FROM booklet_idempotency i
                WHERE i.actor_user_id = $2 AND i.operation = 'request.approve') AS idempotency_records
        FROM booklet_stock s
        JOIN booklet_quota q ON q.campaign_id = s.campaign_id AND q.product_id = s.product_id
        WHERE s.campaign_id = $1 AND s.product_id = $3
      `, [fixture.campaignId, fixture.supervisorId, fixture.productId])
      expect(persisted.rows[0]).toEqual({
        stock: 40, quota: 40, signed_requests: 1, movements: 1, idempotency_records: 1,
      })
      const requests = await pool.query(
        `SELECT r.id, r.status, r.approved_by_user_id, r.approved_at, l.approved_quantity
         FROM booklet_request r JOIN booklet_request_line l ON l.request_id = r.id
         WHERE r.id = ANY($1::text[]) ORDER BY r.id`,
        [fixture.requestIds],
      )
      expect(requests.rows).toEqual([{
        id: fixture.requestIds[0], status: 'approved', approved_by_user_id: fixture.supervisorId,
        approved_at: new Date(firstResult.approvedAt), approved_quantity: 60,
      }])

      const movement = await pool.query(
        `SELECT campaign_id, product_id, quantity, movement, request_id, actor_user_id, idempotency_key
         FROM booklet_stock_movement WHERE campaign_id = $1`,
        [fixture.campaignId],
      )
      expect(movement.rows).toEqual([{
        campaign_id: fixture.campaignId,
        product_id: fixture.productId,
        quantity: 60,
        movement: 'approval',
        request_id: fixture.requestIds[0],
        actor_user_id: fixture.supervisorId,
        idempotency_key: fixture.idempotencyKeys[0],
      }])
      const idempotency = await pool.query(
        `SELECT payload_hash, response_payload FROM booklet_idempotency
         WHERE actor_user_id = $1 AND operation = 'request.approve' AND idempotency_key = $2`,
        [fixture.supervisorId, fixture.idempotencyKeys[0]],
      )
      expect(idempotency.rows).toHaveLength(1)
      expect(idempotency.rows[0]?.payload_hash).toMatch(/^[a-f0-9]{64}$/)
      expect(idempotency.rows[0]?.response_payload).toEqual(firstResult)
    } finally {
      await deleteApprovalFixture(fixture)
    }
  })

  it('never overspends stock or quota across two concurrent requests', async () => {
    const fixture = await createApprovalFixture({ requestCount: 2, requested: 60, stock: 100, quota: 100 })
    try {
      await pool.query('UPDATE infra_afectacion SET severidad = $1 WHERE id = $2', ['Crítica', affectationId])
      const repository = makeIsolatedProjectionRepository(drizzle(pool))
      const outcomes = await Promise.allSettled([
        approveRequest(fixture.actor, fixture.inputs[0]!, repository),
        approveRequest(fixture.actor, fixture.inputs[1]!, repository),
      ])
      expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1)
      expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1)
      const rejected = outcomes.find((outcome) => outcome.status === 'rejected')
      expect(rejected).toMatchObject({ status: 'rejected', reason: { code: 'insufficient_availability' } })

      const persisted = await pool.query(`
        SELECT s.quantity AS stock, q.quantity AS quota,
               (SELECT count(*)::int FROM booklet_request r
                WHERE r.campaign_id = $1 AND r.status = 'approved'
                  AND r.approved_by_user_id IS NOT NULL AND r.approved_at IS NOT NULL) AS signed_requests,
               (SELECT count(*)::int FROM booklet_stock_movement m WHERE m.campaign_id = $1) AS movements,
               (SELECT count(*)::int FROM booklet_idempotency i
                WHERE i.actor_user_id = $2 AND i.operation = 'request.approve') AS idempotency_records
        FROM booklet_stock s
        JOIN booklet_quota q ON q.campaign_id = s.campaign_id AND q.product_id = s.product_id
        WHERE s.campaign_id = $1 AND s.product_id = $3
      `, [fixture.campaignId, fixture.supervisorId, fixture.productId])
      expect(persisted.rows[0]).toEqual({ stock: 40, quota: 40, signed_requests: 1, movements: 1, idempotency_records: 1 })
      const requests = await pool.query(
        `SELECT r.id, r.status, r.approved_by_user_id, r.approved_at, l.approved_quantity
         FROM booklet_request r JOIN booklet_request_line l ON l.request_id = r.id
         WHERE r.id = ANY($1::text[]) ORDER BY r.id`,
        [fixture.requestIds],
      )
      expect(requests.rows.filter((row) => row.status === 'approved')).toHaveLength(1)
      expect(requests.rows.filter((row) => row.status === 'pending')).toHaveLength(1)
      expect(requests.rows.filter((row) => row.approved_by_user_id !== null && row.approved_at !== null)).toHaveLength(1)
      expect(requests.rows.filter((row) => row.approved_quantity === 60)).toHaveLength(1)
      expect(requests.rows.filter((row) => row.approved_quantity === 0)).toHaveLength(1)
    } finally {
      await deleteApprovalFixture(fixture)
    }
  })

  it('rolls back stock, quota, request signature, movement, and idempotency after a database failure', async () => {
    const fixture = await createApprovalFixture({ requestCount: 1, requested: 25, stock: 100, quota: 100 })
    const suffix = randomUUID().replaceAll('-', '')
    const functionName = `cuadernillos_test_fail_${suffix}`
    const triggerName = `cuadernillos_test_fail_${suffix}`
    try {
      await pool.query(`
        CREATE FUNCTION public.${functionName}() RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN
          RAISE EXCEPTION 'isolated fixture failure after stock and quota debit';
        END;
        $$
      `)
      await pool.query(`
        CREATE TRIGGER ${triggerName} BEFORE INSERT ON booklet_stock_movement
        FOR EACH ROW EXECUTE FUNCTION public.${functionName}()
      `)
      await expect(approveRequest(
        fixture.actor,
        fixture.inputs[0]!,
        makeIsolatedProjectionRepository(drizzle(pool)),
      )).rejects.toThrow(/Failed query: insert into "booklet_stock_movement"/)

      const state = await pool.query(`
        SELECT r.status, r.approved_by_user_id, r.approved_at, line.approved_quantity, s.quantity AS stock,
               q.quantity AS quota,
               (SELECT count(*)::int FROM booklet_stock_movement m WHERE m.request_id = r.id) AS movements,
               (SELECT count(*)::int FROM booklet_idempotency i
                WHERE i.actor_user_id = $2 AND i.operation = 'request.approve') AS idempotency_records
        FROM booklet_request r
        JOIN booklet_request_line line ON line.request_id = r.id AND line.product_id = $3
        JOIN booklet_stock s ON s.campaign_id = r.campaign_id AND s.product_id = $3
        JOIN booklet_quota q ON q.campaign_id = r.campaign_id AND q.product_id = $3
             AND q.cabecera_cue_anexo = r.cabecera_cue_anexo
        WHERE r.id = $1
      `, [fixture.requestIds[0], fixture.supervisorId, fixture.productId])
      expect(state.rows[0]).toEqual({
        status: 'pending', approved_by_user_id: null, approved_at: null, approved_quantity: 0,
        stock: 100, quota: 100, movements: 0, idempotency_records: 0,
      })
    } finally {
      await pool.query(`DROP TRIGGER IF EXISTS ${triggerName} ON booklet_stock_movement`)
      await pool.query(`DROP FUNCTION IF EXISTS public.${functionName}()`)
      await deleteApprovalFixture(fixture)
    }
  })

  it('waits for an already-running source commit, then projects its noncritical result', async () => {
    const source = await pool.connect()
    const approval = await pool.connect()
    try {
      await source.query('BEGIN')
      await setSeverity(source, 'Alta')

      const projection = projectEligibility(approval)
      await waitUntilAdvisoryBlocked()
      await source.query('COMMIT')
      await expect(projection).resolves.toMatchObject({ eligible: false, severity: 'Alta' })
    } finally {
      source.release()
      approval.release()
    }
  })

  it('keeps a later source update out until an already-authorized snapshot finishes', async () => {
    await pool.query('UPDATE infra_afectacion SET severidad = $1 WHERE id = $2', ['Crítica', affectationId])
    const approval = await pool.connect()
    const source = await pool.connect()
    try {
      let projectedResult: ((value: Awaited<ReturnType<typeof projectEligibility>>) => void) | undefined
      let releaseProjection: (() => void) | undefined
      const projected = new Promise<Awaited<ReturnType<typeof projectEligibility>>>((resolveProjection) => { projectedResult = resolveProjection })
      const hold = new Promise<void>((resolveHold) => { releaseProjection = resolveHold })
      const projection = createApprovalRepository(drizzle(approval)).transaction(async (tx) => {
        await tx.lockEligibilitySources()
        const eligibility = await tx.getCurrentEligibility(cueAnexo, geSchema)
        projectedResult?.(eligibility)
        await hold
        return eligibility
      })
      await expect(projected).resolves.toMatchObject({ eligible: true, severity: 'Crítica' })

      await source.query('BEGIN')
      let updateFinished = false
      const update = setSeverity(source, 'Alta').then(() => { updateFinished = true })
      await waitUntilAdvisoryBlocked()
      expect(updateFinished).toBe(false)

      releaseProjection?.()
      await expect(projection).resolves.toMatchObject({ eligible: true, severity: 'Crítica' })
      await update
      await source.query('COMMIT')
      await expect(projectEligibility(source)).resolves.toMatchObject({ eligible: false, severity: 'Alta' })
    } finally {
      approval.release()
      source.release()
    }
  })

  it('blocks a phantom affectation insert behind the eligibility snapshot', async () => {
    await pool.query('UPDATE infra_afectacion SET severidad = $1 WHERE id = $2', ['Alta', affectationId])
    const approval = await pool.connect()
    const source = await pool.connect()
    const phantomId = randomUUID()
    try {
      let projectedResult: ((value: Awaited<ReturnType<typeof projectEligibility>>) => void) | undefined
      let releaseProjection: (() => void) | undefined
      const projected = new Promise<Awaited<ReturnType<typeof projectEligibility>>>((resolveProjection) => { projectedResult = resolveProjection })
      const hold = new Promise<void>((resolveHold) => { releaseProjection = resolveHold })
      const projection = createApprovalRepository(drizzle(approval)).transaction(async (tx) => {
        await tx.lockEligibilitySources()
        const eligibility = await tx.getCurrentEligibility(cueAnexo, geSchema)
        projectedResult?.(eligibility)
        await hold
        return eligibility
      })
      await expect(projected).resolves.toMatchObject({ eligible: false, severity: 'Alta' })

      await source.query('BEGIN')
      let insertFinished = false
      const insert = source.query(
        `INSERT INTO infra_afectacion (id, parte_id, motivo, categoria, severidad, rige_desde, creada_en)
         VALUES ($1, $2, 'phantom', 'establecimiento', 'Crítica', now(), now())`,
        [phantomId, partId],
      ).then(() => { insertFinished = true })
      await waitUntilAdvisoryBlocked()
      expect(insertFinished).toBe(false)

      releaseProjection?.()
      await expect(projection).resolves.toMatchObject({ eligible: false, severity: 'Alta' })
      await insert
      await source.query('COMMIT')
      await expect(projectEligibility(source)).resolves.toMatchObject({ eligible: true, severity: 'Crítica' })
    } finally {
      approval.release()
      source.release()
    }
  })

  it('never oversubscribes a single stock row under concurrent conditional debits', async () => {
    const campaignId = randomUUID()
    const productId = `pg-${randomUUID()}`
    await pool.query('INSERT INTO booklet_campaign (id, name, status) VALUES ($1, $2, $3)', [campaignId, 'PG fixture', 'active'])
    await pool.query('INSERT INTO booklet_product (id, name, level_code, grade_code) VALUES ($1, $2, $3, $4)', [productId, 'PG fixture', 'L', 'G'])
    await pool.query('INSERT INTO booklet_stock (campaign_id, product_id, quantity) VALUES ($1, $2, 1)', [campaignId, productId])

    const debit = async () => pool.query(
      `UPDATE booklet_stock SET quantity = quantity - 1
       WHERE campaign_id = $1 AND product_id = $2 AND quantity >= 1 RETURNING quantity`,
      [campaignId, productId],
    )
    const debits = await Promise.all([debit(), debit()])
    expect(debits.reduce((sum, result) => sum + result.rowCount!, 0)).toBe(1)
    const stock = await pool.query('SELECT quantity FROM booklet_stock WHERE campaign_id = $1 AND product_id = $2', [campaignId, productId])
    expect(stock.rows[0]?.quantity).toBe(0)
  })

  it('rolls a stock debit back when a later write in the transaction fails', async () => {
    const campaignId = randomUUID()
    const productId = `pg-${randomUUID()}`
    await pool.query('INSERT INTO booklet_campaign (id, name, status) VALUES ($1, $2, $3)', [campaignId, 'PG rollback fixture', 'active'])
    await pool.query('INSERT INTO booklet_product (id, name, level_code, grade_code) VALUES ($1, $2, $3, $4)', [productId, 'PG rollback fixture', 'L', 'G'])
    await pool.query('INSERT INTO booklet_stock (campaign_id, product_id, quantity) VALUES ($1, $2, 5)', [campaignId, productId])
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('UPDATE booklet_stock SET quantity = quantity - 2 WHERE campaign_id = $1 AND product_id = $2', [campaignId, productId])
      await expect(client.query('UPDATE booklet_stock SET quantity = -1 WHERE campaign_id = $1 AND product_id = $2', [campaignId, productId])).rejects.toThrow()
      await client.query('ROLLBACK')
      const stock = await pool.query('SELECT quantity FROM booklet_stock WHERE campaign_id = $1 AND product_id = $2', [campaignId, productId])
      expect(stock.rows[0]?.quantity).toBe(5)
    } finally {
      client.release()
    }
  })
})
