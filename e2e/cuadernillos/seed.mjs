import { registerTsResolver } from '../../scripts/lib/register-ts-resolver.mjs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
registerTsResolver(root)

const [{ auth }, { getDb, getRawClient }, { resolveDriver }, schema] = await Promise.all([
  import('../../lib/auth.ts'),
  import('../../lib/db/index.ts'),
  import('../../lib/db/driver.ts'),
  import('../../lib/db/schema.ts'),
])
const { ensureSeeded } = await import('../../lib/db/seed.ts')
const rawClient = getRawClient()
if (resolveDriver() === 'postgres') {
  const target = new URL(process.env.DATABASE_URL ?? '')
  const socket = target.searchParams.get('host')
  const expectedSocket = process.env.T8_E2E_PG_SOCKET
  if (!expectedSocket || socket !== expectedSocket
    || !(socket.startsWith('/tmp/cuadernillos-pg-proof-') || socket.startsWith('/tmp/cuadernillos-pg-e2e.'))) {
    throw new Error('T8 fixture requires the explicit disposable PostgreSQL Unix socket')
  }
  const { rows } = await rawClient.query(`
    SELECT current_database() AS database, inet_server_addr()::text AS address,
           current_setting('server_version_num')::integer AS version
  `)
  if (rows[0]?.database !== 'cuadernillos_e2e' || rows[0]?.address !== null || rows[0]?.version < 150000) {
    throw new Error('T8 PostgreSQL fixture must use database cuadernillos_e2e on a local socket with PostgreSQL 15+')
  }
}
await ensureSeeded()
const db = getDb()
const context = await auth.$context
const ids = {
  planning: 't8-fixture-planning',
  cabecera: 't8-fixture-cabecera',
  supervisor: 't8-fixture-supervisor',
}

for (const [capability, userId] of Object.entries(ids)) {
  const created = await context.internalAdapter.createUser({
    id: userId,
    email: `${userId}@example.test`,
    name: `Fixture ${capability}`,
    role: 'consulta',
    emailVerified: true,
  }, { method: 'admin' })
  await db.insert(schema.account).values({
    id: `account-${userId}`,
    issuer: 'local:credential',
    userId: created.id,
    providerId: 'credential',
    accountId: created.id,
    password: await context.password.hash(process.env[`T8_${capability.toUpperCase()}_PASSWORD`]),
  })
  await db.update(schema.user).set({
    hubSecciones: ['cuadernillos'],
    hubLanding: false,
    hubDestino: '/cuadernillos',
  }).where((await import('drizzle-orm')).eq(schema.user.id, userId))
  await db.insert(schema.bookletMembership).values({
    id: `membership-${capability}`,
    userId,
    capability,
    grantedByUserId: ids.planning,
  })
}

const now = new Date()
const campaignId = 't8-fixture-campaign'
const productId = 't8-fixture-product'
const requestId = 't8-fixture-pending'
const headCue = String(100_000_000 + Math.floor(Math.random() * 900_000_000))
let recipientCue = String(100_000_000 + Math.floor(Math.random() * 900_000_000))
while (recipientCue === headCue) recipientCue = String(100_000_000 + Math.floor(Math.random() * 900_000_000))
await db.insert(schema.bookletCampaign).values({
  id: campaignId, name: 'Campaña de prueba aislada', status: 'active',
  distributionEnabled: true, overassignmentAllowed: false,
})
await db.insert(schema.bookletProduct).values({
  id: productId, name: 'Cuadernillo de prueba', levelCode: 'FIXTURE', gradeCode: 'FIXTURE',
})
await db.insert(schema.bookletProductMapping).values({
  productId, sourceLevelCode: 'FIXTURE', sourceGradeCode: 'FIXTURE',
  confirmedByUserId: ids.planning, confirmedAt: now,
})
const sourceRows = [
  { cue: headCue, schoolName: 'Escuela Cabecera de prueba', relationship: 'cabecera', supervisorName: 'Supervisor de prueba', cabeceraCue: null,
    provenance: { sourceId: 'synthetic-fixture', location: 'e2e/cuadernillos/seed.mjs!A1' } },
  { cue: recipientCue, schoolName: 'Escuela Anexo de prueba', relationship: 'dependiente', supervisorName: 'Supervisor de prueba', cabeceraCue: headCue,
    provenance: { sourceId: 'synthetic-fixture', location: 'e2e/cuadernillos/seed.mjs!A2' } },
]
if (resolveDriver() === 'postgres') {
  const [{ stageAssignmentSourceManifest, confirmStagedAssignmentSource }, { crearEjecutorSql, ensureGeSchema }] = await Promise.all([
    import('../../lib/cuadernillos/assignment-source.ts'),
    import('../../lib/infraestructura/ge-db.ts'),
  ])
  const plannerActor = { id: ids.planning, role: 'admin', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [] }
  const staged = await stageAssignmentSourceManifest(plannerActor, 't8-synthetic-source', sourceRows, db)
  await confirmStagedAssignmentSource(plannerActor, staged.previewHash, staged.preview.accepted.map((assignment) => ({
    cueAnexo: assignment.cueAnexo,
    sourceRowHash: staged.sourceRowHashes[assignment.cueAnexo],
    supervisorUserId: ids.supervisor,
    cabeceraUserId: ids.cabecera,
  })), db)
  const geSchemaReady = await ensureGeSchema(crearEjecutorSql(rawClient))
  void geSchemaReady
  const affectationAt = new Date()
  const { rows: activePeriods } = await rawClient.query(
    `SELECT id FROM infra_periodo WHERE estado = 'vigente' LIMIT 1`,
  )
  let periodId = activePeriods[0]?.id
  if (!periodId) {
    periodId = 't8-fixture-period'
    await rawClient.query(
      `INSERT INTO infra_periodo (id, nombre, inicio_en, fin_en, estado, creada_en)
       VALUES ($1, 'Cuadernillos T8 fixture', $2, NULL, 'vigente', $2)`,
      [periodId, affectationAt.toISOString()],
    )
  }
  if (!periodId) throw new Error('T8 fixture requires an active infrastructure period')
  await rawClient.query(
    `INSERT INTO ge.ge_localizacion (cue_anexo, nombre, departamento, localidad)
     VALUES ($1, 'Escuela Anexo de prueba', 'Fixture', 'Fixture')`,
    [recipientCue],
  )
  await rawClient.query(
    `INSERT INTO infra_parte (id, periodo_id, cue_anexo, estado_establecimiento,
      estado_establecimiento_rige_desde, corte_id, creada_en, actualizada_en)
     VALUES ('t8-fixture-part', $1, $2, 'habitual', $3, 0, $3, $3)`,
    [periodId, recipientCue, affectationAt.toISOString()],
  )
  await rawClient.query(
    `INSERT INTO infra_afectacion (id, parte_id, motivo, categoria, severidad, rige_desde, creada_en, retirada_en)
     VALUES ('t8-fixture-affectation', 't8-fixture-part', 'fixture', 'establecimiento', 'Crítica', $1, $1, NULL)`,
    [affectationAt.toISOString()],
  )
} else {
  const provenance = [{ sourceId: 'synthetic-fixture', location: 'e2e/cuadernillos/seed.mjs' }]
  for (const assignment of [
    { cueAnexo: headCue, schoolName: 'Escuela Cabecera de prueba', relationship: 'cabecera', cabeceraCue: headCue },
    { cueAnexo: recipientCue, schoolName: 'Escuela Anexo de prueba', relationship: 'dependiente', cabeceraCue: headCue },
  ]) {
    await db.insert(schema.bookletSchoolAssignment).values({
      ...assignment,
      supervisorName: 'Supervisor de prueba',
      supervisorUserId: ids.supervisor,
      cabeceraUserId: ids.cabecera,
      provenance,
      confirmedByUserId: ids.planning,
      confirmedAt: now,
    })
  }
}
await db.insert(schema.bookletStock).values({ campaignId, productId, quantity: 100 })
await db.insert(schema.bookletQuota).values({
  campaignId, cabeceraCueAnexo: headCue, productId,
  quantity: 50, updatedByUserId: ids.planning,
})
await db.insert(schema.bookletRequest).values({
  id: requestId, campaignId, recipientCueAnexo: recipientCue,
  cabeceraCueAnexo: headCue, parentRequestId: null, rootRequestId: requestId,
  status: 'pending', createdByUserId: ids.cabecera, createdAt: now, submittedAt: now,
})
await db.insert(schema.bookletRequestLine).values({
  requestId, productId, quantity: 12, approvedQuantity: 0,
})
if (resolveDriver() !== 'postgres') {
  const approvedAt = new Date(now.getTime() - 60_000)
  await db.insert(schema.bookletRequest).values({
    id: 't8-fixture-approved', campaignId, recipientCueAnexo: recipientCue,
    cabeceraCueAnexo: headCue, parentRequestId: null, rootRequestId: 't8-fixture-approved',
    status: 'approved', createdByUserId: ids.cabecera, createdAt: approvedAt, submittedAt: approvedAt,
    approvedByUserId: ids.supervisor, approvedAt,
  })
  await db.insert(schema.bookletRequestLine).values({
    requestId: 't8-fixture-approved', productId, quantity: 12, approvedQuantity: 8,
  })
}

const fixtureStatePath = path.join(root, 'e2e/cuadernillos/.results/fixture-state.json')
await mkdir(path.dirname(fixtureStatePath), { recursive: true })
await writeFile(fixtureStatePath, JSON.stringify({ campaignId, productId, requestId, headCue, recipientCue }), 'utf8')

const client = rawClient
if (typeof client.close === 'function') await client.close()
else await client.end()
console.log('T8 fixture seeded in the isolated local database.')
